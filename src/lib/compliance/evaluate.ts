import { Prisma } from "@/generated/prisma/client";
import { loadStoredCodeAnalysisFromDb } from "@/lib/code-analysis/persist";
import { prisma } from "@/lib/prisma";
import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";
import { pruneOldComplianceFindings } from "@/lib/compliance/prune";
import { rulesForPhase } from "@/lib/compliance/rules";
import type {
  ComplianceEvalPhase,
  ComplianceFindingCandidate,
  EvaluateComplianceResult,
} from "@/lib/compliance/types";

function isMissingComplianceTables(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" ||
      error.message.includes("ComplianceFinding") ||
      error.message.includes("ComplianceRuleState"))
  );
}

async function loadDisabledRuleKeys(organizationId: string): Promise<Set<string>> {
  try {
    const rows = await prisma.complianceRuleState.findMany({
      where: { organizationId, enabled: false },
      select: { ruleKey: true, projectKey: true },
    });
    return new Set(rows.map((row) => `${row.ruleKey}:${row.projectKey ?? "*"}`));
  } catch (error) {
    if (isMissingComplianceTables(error)) return new Set();
    throw error;
  }
}

function isRuleDisabled(
  disabledKeys: Set<string>,
  ruleKey: string,
  projectKey: string | null | undefined,
): boolean {
  if (disabledKeys.has(`${ruleKey}:*`)) return true;
  if (projectKey && disabledKeys.has(`${ruleKey}:${projectKey}`)) return true;
  return false;
}

function filterCandidates(
  candidates: ComplianceFindingCandidate[],
  disabledKeys: Set<string>,
): ComplianceFindingCandidate[] {
  return candidates.filter(
    (candidate) => !isRuleDisabled(disabledKeys, candidate.ruleKey, candidate.projectKey),
  );
}

export async function evaluateCompliance(
  organizationId: string,
  phase: ComplianceEvalPhase,
): Promise<EvaluateComplianceResult> {
  try {
    return await evaluateComplianceInner(organizationId, phase);
  } catch (error) {
    if (isMissingComplianceTables(error)) {
      return { status: "skipped", reason: "compliance_tables_missing", phase, triggered: 0, created: 0, updated: 0, resolved: 0, reopened: 0 };
    }
    throw error;
  }
}

async function evaluateComplianceInner(
  organizationId: string,
  phase: ComplianceEvalPhase,
): Promise<EvaluateComplianceResult> {
  const stored = await loadStoredCodeAnalysisFromDb(organizationId);
  if (!stored || (stored.pullRequests.length === 0 && stored.commits.length === 0)) {
    return {
      status: "skipped",
      reason: "no_code_analysis_data",
      phase,
      triggered: 0,
      created: 0,
      updated: 0,
      resolved: 0,
      reopened: 0,
    };
  }

  const disabledKeys = await loadDisabledRuleKeys(organizationId);

  const rules = rulesForPhase(phase);
  const ruleKeys = new Set(rules.map((rule) => rule.key));
  const ctx = {
    pullRequests: stored.pullRequests,
    commits: stored.commits,
  };

  const rawCandidates = rules.flatMap((rule) => rule.evaluate(ctx));
  const candidates = filterCandidates(rawCandidates, disabledKeys);
  const activeDedupKeys = new Set(candidates.map((c) => c.dedupKey));
  const now = new Date();

  let created = 0;
  let updated = 0;
  let reopened = 0;
  let newCritical = 0;

  for (const candidate of candidates) {
    const existing = await prisma.complianceFinding.findUnique({
      where: {
        organizationId_dedupKey: {
          organizationId,
          dedupKey: candidate.dedupKey,
        },
      },
    });

    if (!existing) {
      await prisma.complianceFinding.create({
        data: {
          organizationId,
          ruleKey: candidate.ruleKey,
          dedupKey: candidate.dedupKey,
          severity: candidate.severity,
          status: "open",
          targetType: candidate.targetType,
          targetExternalId: candidate.targetExternalId,
          projectKey: candidate.projectKey ?? null,
          title: candidate.title,
          detailJson: JSON.stringify(candidate.detail),
          entityLabel: candidate.entityLabel ?? null,
          entityUrl: candidate.entityUrl ?? null,
          repo: candidate.repo ?? null,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
      created += 1;
      if (candidate.severity === "critical") newCritical += 1;
      continue;
    }

    if (existing.status === "resolved") {
      await prisma.complianceFinding.update({
        where: { id: existing.id },
        data: {
          status: "open",
          resolvedAt: null,
          lastSeenAt: now,
          severity: candidate.severity,
          title: candidate.title,
          detailJson: JSON.stringify(candidate.detail),
          entityLabel: candidate.entityLabel ?? null,
          entityUrl: candidate.entityUrl ?? null,
          repo: candidate.repo ?? null,
        },
      });
      reopened += 1;
      if (candidate.severity === "critical") newCritical += 1;
      continue;
    }

    await prisma.complianceFinding.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: now,
        severity: candidate.severity,
        title: candidate.title,
        detailJson: JSON.stringify(candidate.detail),
        entityLabel: candidate.entityLabel ?? null,
        entityUrl: candidate.entityUrl ?? null,
        repo: candidate.repo ?? null,
      },
    });
    updated += 1;
  }

  const openFindings = await prisma.complianceFinding.findMany({
    where: {
      organizationId,
      status: "open",
      ruleKey: { in: [...ruleKeys] },
    },
    select: { id: true, dedupKey: true },
  });

  const toResolve = openFindings.filter((f) => !activeDedupKeys.has(f.dedupKey));
  let resolved = 0;

  if (toResolve.length > 0) {
    const result = await prisma.complianceFinding.updateMany({
      where: {
        id: { in: toResolve.map((f) => f.id) },
      },
      data: {
        status: "resolved",
        resolvedAt: now,
      },
    });
    resolved = result.count;
  }

  await pruneOldComplianceFindings(organizationId);

  const changed = created + updated + resolved + reopened > 0;
  if (changed) {
    invalidateExecutiveBriefingSnapshot(organizationId);
  }

  if (newCritical > 0) {
    await prisma.activityEvent.create({
      data: {
        organizationId,
        type: "compliance.finding_critical",
        title: "Critical compliance findings",
        description: `${newCritical} new or reopened critical compliance finding${newCritical === 1 ? "" : "s"} detected.`,
        metadataJson: JSON.stringify({ newCritical, phase }),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: null,
        action: "compliance.evaluated",
        entityType: "Organization",
        entityId: organizationId,
        metadataJson: JSON.stringify({
          phase,
          created,
          updated,
          resolved,
          reopened,
          newCritical,
        }),
      },
    });
  }

  return {
    status: "evaluated",
    phase,
    triggered: candidates.length,
    created,
    updated,
    resolved,
    reopened,
  };
}
