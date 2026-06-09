import type { AgentRegistry, AgentType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type InboxWorkType =
  | "release_assess"
  | "incident_triage"
  | "webhook_process"
  | "approval_followup";

export type InboxWorkItem = {
  id: string;
  workType: InboxWorkType;
  entityType: string;
  entityId: string;
  status: "pending" | "in_progress";
  priority: number;
  assignedAt: string;
  title: string;
  metadata?: Record<string, unknown>;
};

function releasePriority(environment: string): number {
  if (environment === "PRODUCTION") return 0;
  if (environment === "STAGING") return 1;
  return 2;
}

function inboxItemId(workType: InboxWorkType, entityId: string): string {
  return `${workType}:${entityId}`;
}

export function parseInboxItemId(
  id: string,
): { workType: InboxWorkType; entityId: string } | null {
  const match = id.match(
    /^(release_assess|incident_triage|webhook_process|approval_followup):(.+)$/,
  );
  if (!match) return null;
  return {
    workType: match[1] as InboxWorkType,
    entityId: match[2],
  };
}

async function buildQaInbox(
  organizationId: string,
): Promise<InboxWorkItem[]> {
  const releases = await prisma.release.findMany({
    where: { organizationId, status: "DETECTED" },
    orderBy: [{ environment: "asc" }, { detectedAt: "asc" }],
    take: 20,
  });

  if (releases.length === 0) return [];

  const releaseIds = releases.map((r) => r.id);
  const pendingRecs = await prisma.recommendation.findMany({
    where: {
      organizationId,
      releaseId: { in: releaseIds },
      status: "PENDING",
    },
    select: { releaseId: true },
  });
  const pendingReleaseIds = new Set(
    pendingRecs.map((r) => r.releaseId).filter(Boolean) as string[],
  );

  return releases
    .filter((r) => !pendingReleaseIds.has(r.id))
    .map((release) => ({
      id: inboxItemId("release_assess", release.id),
      workType: "release_assess" as const,
      entityType: "Release",
      entityId: release.id,
      status: "pending" as const,
      priority: releasePriority(release.environment),
      assignedAt: release.detectedAt.toISOString(),
      title: `Assess release: ${release.name}`,
      metadata: {
        environment: release.environment,
        version: release.version,
      },
    }))
    .sort((a, b) => a.priority - b.priority);
}

async function buildGovernanceInbox(
  organizationId: string,
  payload: Record<string, unknown>,
): Promise<InboxWorkItem[]> {
  if (typeof payload.approvalId === "string") {
    const approval = await prisma.approval.findFirst({
      where: { id: payload.approvalId, organizationId },
      include: { recommendation: true },
    });
    if (approval?.recommendation) {
      return [
        {
          id: inboxItemId("approval_followup", approval.id),
          workType: "approval_followup",
          entityType: "Approval",
          entityId: approval.id,
          status: "pending",
          priority: 0,
          assignedAt: approval.createdAt.toISOString(),
          title: `Approval follow-up: ${approval.recommendation.title}`,
          metadata: {
            decision: payload.decision,
            releaseId: approval.recommendation.releaseId,
          },
        },
      ];
    }
  }

  const highRiskReleases = await prisma.release.findMany({
    where: {
      organizationId,
      status: "PENDING_APPROVAL",
      riskLevel: { in: ["HIGH", "CRITICAL"] },
    },
    orderBy: { assessedAt: "desc" },
    take: 5,
  });

  return highRiskReleases.map((release) => ({
    id: inboxItemId("release_assess", release.id),
    workType: "release_assess",
    entityType: "Release",
    entityId: release.id,
    status: "pending",
    priority: releasePriority(release.environment),
    assignedAt: (release.assessedAt ?? release.detectedAt).toISOString(),
    title: `Review high-risk release: ${release.name}`,
    metadata: {
      environment: release.environment,
      riskLevel: release.riskLevel,
    },
  }));
}

async function buildSuperOrchestratorInbox(
  organizationId: string,
  payload: Record<string, unknown>,
): Promise<InboxWorkItem[]> {
  const [qa, governance] = await Promise.all([
    buildQaInbox(organizationId),
    buildGovernanceInbox(organizationId, payload),
  ]);

  const byId = new Map<string, InboxWorkItem>();
  for (const item of [...qa, ...governance]) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort((a, b) => a.priority - b.priority);
}

/** Build virtual inbox items from domain entities (no AgentWorkItem table). */
export async function buildAgentInbox(
  agent: Pick<AgentRegistry, "id" | "organizationId" | "agentType">,
  wakeupPayload: Record<string, unknown> = {},
): Promise<InboxWorkItem[]> {
  const { organizationId, agentType } = agent;

  switch (agentType as AgentType) {
    case "SUPER_ORCHESTRATOR":
      return buildSuperOrchestratorInbox(organizationId, wakeupPayload);
    case "QA_INTELLIGENCE":
      return buildQaInbox(organizationId);
    case "GOVERNANCE":
      return buildGovernanceInbox(organizationId, wakeupPayload);
    default:
      return [];
  }
}
