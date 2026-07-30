import { prisma } from "@/lib/prisma";
import type { LatestAgentAnalysisBundle } from "@/lib/agent-analysis/types";
import { isOpsQueueRecommendationTitle } from "@/lib/agent-analysis/ops-queue";

export { isOpsQueueRecommendationTitle } from "@/lib/agent-analysis/ops-queue";

function devopsRecTitle(findingId: string, title: string): string {
  return `[cloud:${findingId}] ${title}`;
}

function qaBoardRecTitle(projectKeys: string[]): string {
  const scope = projectKeys.length > 0 ? projectKeys.join(",") : "board";
  return `[qa-board:${scope}] Unblock board health before release`;
}

function parsePrefixedId(title: string, prefix: string): string | null {
  const match = title.match(new RegExp(`^\\[${prefix}:([^\\]]+)\\]`));
  return match?.[1] ?? null;
}

/**
 * Idempotently create PENDING recommendations from latest CRITICAL cloud
 * findings and ONE aggregated QA board-health recommendation.
 *
 * Ops-queue items are recommendations only (no Approval Center rows) so
 * leadership gates stay clean. Concurrent callers are serialized with a
 * Postgres advisory lock and duplicates are collapsed before create.
 */
export async function syncAgentAnalysisRecommendations(
  organizationId: string,
  bundle: LatestAgentAnalysisBundle,
): Promise<{ created: number; deduped: number }> {
  return prisma.$transaction(async (tx) => {
    // Serialize per-org so dashboard/qa/devops page loads cannot race-create.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-rec-sync:${organizationId}`}))`;

    await collapseLegacyQaBlockedRecommendations(tx, organizationId);
    const deduped =
      (await dedupePrefixedRecommendations(tx, organizationId, "cloud")) +
      (await dedupePrefixedRecommendations(tx, organizationId, "qa-board"));
    // Cloud hygiene is an eng ops queue — never a leadership Approval Center item.
    await closeOpsQueueApprovals(tx, organizationId);

    const existing = await tx.recommendation.findMany({
      where: {
        organizationId,
        status: { in: ["PENDING", "APPROVED", "MODIFIED"] },
        OR: [
          { title: { startsWith: "[cloud:" } },
          { title: { startsWith: "[qa-board:" } },
        ],
      },
      select: { title: true },
    });

    const knownCloud = new Set<string>();
    let hasQaBoard = false;
    for (const row of existing) {
      const cloudId = parsePrefixedId(row.title, "cloud");
      if (cloudId) knownCloud.add(cloudId);
      if (row.title.startsWith("[qa-board:")) hasQaBoard = true;
    }

    let created = 0;

    const criticalFindings =
      bundle.devops?.topFindings.filter((f) => f.severity === "CRITICAL").slice(0, 5) ??
      [];

    for (const finding of criticalFindings) {
      if (knownCloud.has(finding.id)) continue;

      const rec = await tx.recommendation.create({
        data: {
          organizationId,
          title: devopsRecTitle(finding.id, finding.title),
          description: finding.description,
          rationale: finding.recommendation,
          impact: "HIGH",
          confidence: 0.85,
          affectedSystems: JSON.stringify(
            [finding.resourceType, finding.resourceRef].filter(Boolean),
          ),
          requiredRole: "DEVOPS_LEAD",
          status: "PENDING",
        },
      });
      await tx.activityEvent.create({
        data: {
          organizationId,
          type: "recommendation.created",
          title: "Cloud hygiene recommendation",
          description: finding.title,
          metadataJson: JSON.stringify({
            recommendationId: rec.id,
            source: "devops-agent",
            queue: "ops",
          }),
        },
      });
      knownCloud.add(finding.id);
      created += 1;
    }

    const blockedIssues =
      bundle.qa?.evidence.filter((e) => e.preset === "BLOCKED") ?? [];
    const blockedCount = bundle.qa?.blocked ?? blockedIssues.length;

    if (blockedCount > 0 && !hasQaBoard && bundle.qa) {
      const sampleKeys = blockedIssues
        .slice(0, 8)
        .map((i) => i.issueKey)
        .filter(Boolean);
      const sampleList =
        sampleKeys.length > 0
          ? ` Sample keys: ${sampleKeys.join(", ")}${blockedCount > sampleKeys.length ? "…" : ""}.`
          : "";

      const rec = await tx.recommendation.create({
        data: {
          organizationId,
          title: qaBoardRecTitle(bundle.qa.projectKeys),
          description: `${blockedCount} blocked issue${blockedCount === 1 ? "" : "s"} on ${
            bundle.qa.projectKeys.join(", ") || "the Jira board"
          }. Review and unblock before the next release gate.${sampleList}`,
          rationale:
            "Board health is an engineering ops signal — not a leadership release approval. Route to the delivery lead; do not flood the Approval Center.",
          impact: "HIGH",
          confidence: 0.85,
          affectedSystems: JSON.stringify(bundle.qa.projectKeys),
          requiredRole: "ENGINEERING_MANAGER",
          status: "PENDING",
        },
      });
      await tx.activityEvent.create({
        data: {
          organizationId,
          type: "recommendation.created",
          title: "QA board-health recommendation",
          description: `${blockedCount} blocked`,
          metadataJson: JSON.stringify({
            recommendationId: rec.id,
            source: "qa-agent",
            blockedCount,
            sampleKeys,
            queue: "ops",
          }),
        },
      });
      created += 1;
    }

    return { created, deduped };
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Reject legacy per-ticket qa-blocked recommendations and their approvals. */
async function collapseLegacyQaBlockedRecommendations(
  tx: Tx,
  organizationId: string,
): Promise<void> {
  const legacy = await tx.recommendation.findMany({
    where: {
      organizationId,
      status: "PENDING",
      title: { startsWith: "[qa-blocked:" },
    },
    select: { id: true },
  });
  if (legacy.length === 0) return;

  const ids = legacy.map((r) => r.id);
  await tx.approval.updateMany({
    where: {
      organizationId,
      recommendationId: { in: ids },
      decision: null,
    },
    data: {
      decision: "REJECTED",
      comment: "Collapsed into aggregated QA board-health recommendation",
      decidedAt: new Date(),
    },
  });
  await tx.recommendation.updateMany({
    where: { id: { in: ids } },
    data: { status: "REJECTED" },
  });
}

/**
 * Keep the oldest PENDING recommendation per prefixed id (`cloud:<id>` /
 * exact `qa-board:…` title); reject the rest and close their open approvals.
 */
async function dedupePrefixedRecommendations(
  tx: Tx,
  organizationId: string,
  prefix: "cloud" | "qa-board",
): Promise<number> {
  const rows = await tx.recommendation.findMany({
    where: {
      organizationId,
      status: "PENDING",
      title: { startsWith: `[${prefix}:` },
    },
    select: { id: true, title: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length <= 1) return 0;

  const keep = new Set<string>();
  const rejectIds: string[] = [];

  for (const row of rows) {
    const key =
      prefix === "cloud"
        ? (parsePrefixedId(row.title, "cloud") ?? row.title)
        : row.title;
    if (keep.has(key)) {
      rejectIds.push(row.id);
    } else {
      keep.add(key);
    }
  }

  if (rejectIds.length === 0) return 0;

  await tx.approval.updateMany({
    where: {
      organizationId,
      recommendationId: { in: rejectIds },
      decision: null,
    },
    data: {
      decision: "REJECTED",
      comment: "Deduped duplicate agent-analysis recommendation",
      decidedAt: new Date(),
    },
  });
  await tx.recommendation.updateMany({
    where: { id: { in: rejectIds } },
    data: { status: "REJECTED" },
  });

  return rejectIds.length;
}

/** Close open Approval rows for ops-queue titles (cloud / qa-*). */
async function closeOpsQueueApprovals(
  tx: Tx,
  organizationId: string,
): Promise<void> {
  const open = await tx.approval.findMany({
    where: {
      organizationId,
      decision: null,
    },
    select: {
      id: true,
      title: true,
      recommendation: { select: { title: true } },
    },
  });

  const ids = open
    .filter((a) =>
      isOpsQueueRecommendationTitle(a.title ?? a.recommendation?.title ?? ""),
    )
    .map((a) => a.id);

  if (ids.length === 0) return;

  await tx.approval.updateMany({
    where: { id: { in: ids } },
    data: {
      decision: "REJECTED",
      comment:
        "Ops queue — tracked on Recommendations for eng leads, not Approval Center",
      decidedAt: new Date(),
    },
  });
}
