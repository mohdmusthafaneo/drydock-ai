import type { AgentRegistry, AgentType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPendingComplianceFindingIds } from "@/lib/compliance/recommendation-keys";
import { EVENT_ROLE_ROUTING } from "./delegation";
import type { HireRole } from "./hire";

export type InboxWorkType =
  | "release_assess"
  | "release_delegate"
  | "compliance_delegate"
  | "compliance_finding"
  | "incident_triage"
  | "webhook_process"
  | "telemetry_review"
  | "approval_followup"
  | "team_initialization";

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
    /^(release_assess|release_delegate|compliance_delegate|compliance_finding|incident_triage|webhook_process|telemetry_review|approval_followup|team_initialization):(.+)$/,
  );
  if (!match) return null;
  return {
    workType: match[1] as InboxWorkType,
    entityId: match[2],
  };
}

function resolveEffectiveRole(
  agent: Pick<AgentRegistry, "agentType" | "role">,
): HireRole | null {
  if (agent.role) return agent.role as HireRole;
  const typeToRole: Partial<Record<AgentType, HireRole>> = {
    QA_INTELLIGENCE: "qa_intelligence",
    DEVOPS_INTELLIGENCE: "devops_intelligence",
    GOVERNANCE: "governance",
    INCIDENT_CORRELATION: "incident_correlation",
    INTEGRATION: "integration",
  };
  return typeToRole[agent.agentType as AgentType] ?? null;
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

async function buildReleaseDelegateInbox(
  organizationId: string,
  payload: Record<string, unknown>,
): Promise<InboxWorkItem[]> {
  const items: InboxWorkItem[] = [];

  if (typeof payload.releaseId === "string") {
    const release = await prisma.release.findFirst({
      where: { id: payload.releaseId, organizationId },
    });
    if (release) {
      const targetRole =
        EVENT_ROLE_ROUTING[String(payload.event ?? payload.reason ?? "release.detected")] ??
        "qa_intelligence";
      items.push({
        id: inboxItemId("release_delegate", release.id),
        workType: "release_delegate",
        entityType: "Release",
        entityId: release.id,
        status: "pending",
        priority: releasePriority(release.environment),
        assignedAt: release.detectedAt.toISOString(),
        title: `Delegate release work: ${release.name}`,
        metadata: {
          environment: release.environment,
          version: release.version,
          targetRole,
          event: payload.event ?? payload.reason,
        },
      });
    }
  }

  const detected = await prisma.release.findMany({
    where: { organizationId, status: "DETECTED" },
    orderBy: [{ environment: "asc" }, { detectedAt: "asc" }],
    take: 10,
  });

  for (const release of detected) {
    if (items.some((i) => i.entityId === release.id)) continue;
    items.push({
      id: inboxItemId("release_delegate", release.id),
      workType: "release_delegate",
      entityType: "Release",
      entityId: release.id,
      status: "pending",
      priority: releasePriority(release.environment) + 1,
      assignedAt: release.detectedAt.toISOString(),
      title: `Delegate release assessment: ${release.name}`,
      metadata: {
        environment: release.environment,
        targetRole: "qa_intelligence",
      },
    });
  }

  return items.sort((a, b) => a.priority - b.priority);
}

async function buildComplianceDelegateInbox(
  organizationId: string,
  payload: Record<string, unknown>,
): Promise<InboxWorkItem[]> {
  const event = String(payload.event ?? payload.reason ?? "");
  if (event !== "compliance.evaluated") return [];

  const targetRole = EVENT_ROLE_ROUTING[event] ?? "governance";
  const batchKey = String(payload.batchKey ?? organizationId);

  return [
    {
      id: inboxItemId("compliance_delegate", batchKey),
      workType: "compliance_delegate",
      entityType: "Organization",
      entityId: organizationId,
      status: "pending",
      priority: 0,
      assignedAt: new Date().toISOString(),
      title: "Delegate compliance remediation to governance specialist",
      metadata: {
        targetRole,
        event,
        newCritical: payload.newCritical,
        phase: payload.phase,
      },
    },
  ];
}

async function buildComplianceFindingInbox(
  organizationId: string,
): Promise<InboxWorkItem[]> {
  const [criticalFindings, pendingFindingIds] = await Promise.all([
    prisma.complianceFinding.findMany({
      where: {
        organizationId,
        status: "open",
        severity: "critical",
      },
      orderBy: { lastSeenAt: "desc" },
      take: 20,
    }),
    loadPendingComplianceFindingIds(organizationId),
  ]);

  return criticalFindings
    .filter((finding) => !pendingFindingIds.has(finding.id))
    .map((finding) => ({
      id: inboxItemId("compliance_finding", finding.id),
      workType: "compliance_finding" as const,
      entityType: "ComplianceFinding",
      entityId: finding.id,
      status: "pending" as const,
      priority: 0,
      assignedAt: finding.lastSeenAt.toISOString(),
      title: `Remediate critical compliance: ${finding.title}`,
      metadata: {
        ruleKey: finding.ruleKey,
        severity: finding.severity,
        targetType: finding.targetType,
        entityLabel: finding.entityLabel,
        entityUrl: finding.entityUrl,
        repo: finding.repo,
        projectKey: finding.projectKey,
      },
    }));
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

  const [highRiskReleases, complianceFindings] = await Promise.all([
    prisma.release.findMany({
      where: {
        organizationId,
        status: "PENDING_APPROVAL",
        riskLevel: { in: ["HIGH", "CRITICAL"] },
      },
      orderBy: { assessedAt: "desc" },
      take: 5,
    }),
    buildComplianceFindingInbox(organizationId),
  ]);

  const releaseItems = highRiskReleases.map((release) => ({
    id: inboxItemId("release_assess", release.id),
    workType: "release_assess" as const,
    entityType: "Release",
    entityId: release.id,
    status: "pending" as const,
    priority: releasePriority(release.environment),
    assignedAt: (release.assessedAt ?? release.detectedAt).toISOString(),
    title: `Review high-risk release: ${release.name}`,
    metadata: {
      environment: release.environment,
      riskLevel: release.riskLevel,
    },
  }));

  return [...complianceFindings, ...releaseItems].sort(
    (a, b) => a.priority - b.priority,
  );
}

async function buildWebhookInbox(
  organizationId: string,
  payload: Record<string, unknown>,
): Promise<InboxWorkItem[]> {
  const webhookEventId =
    typeof payload.webhookEventId === "string" ? payload.webhookEventId : null;
  if (!webhookEventId) return [];

  const event = await prisma.webhookEvent.findFirst({
    where: { id: webhookEventId, organizationId },
  });
  if (!event) return [];

  return [
    {
      id: inboxItemId("webhook_process", event.id),
      workType: "webhook_process",
      entityType: "WebhookEvent",
      entityId: event.id,
      status: "pending",
      priority: 1,
      assignedAt: event.receivedAt.toISOString(),
      title: `Process webhook: ${event.provider} ${event.eventType}`,
      metadata: {
        provider: event.provider,
        eventType: event.eventType,
      },
    },
  ];
}

async function buildTelemetryInbox(
  organizationId: string,
  payload: Record<string, unknown>,
): Promise<InboxWorkItem[]> {
  const telemetryEventId =
    typeof payload.telemetryEventId === "string" ? payload.telemetryEventId : null;
  if (!telemetryEventId) return [];

  const event = await prisma.telemetryEvent.findFirst({
    where: { id: telemetryEventId, organizationId },
  });
  if (!event) return [];

  return [
    {
      id: inboxItemId("telemetry_review", event.id),
      workType: "telemetry_review",
      entityType: "TelemetryEvent",
      entityId: event.id,
      status: "pending",
      priority: 1,
      assignedAt: event.occurredAt.toISOString(),
      title: `Review telemetry: ${event.eventType} (${event.source})`,
      metadata: {
        eventType: event.eventType,
        source: event.source,
        severity: event.severity,
      },
    },
  ];
}

async function buildTeamInitializationInbox(
  organizationId: string,
): Promise<InboxWorkItem[]> {
  const workflow = await prisma.deliveryWorkflow.findUnique({
    where: { organizationId },
    select: { agentTeamInitializedAt: true },
  });

  if (workflow?.agentTeamInitializedAt) return [];

  return [
    {
      id: inboxItemId("team_initialization", organizationId),
      workType: "team_initialization",
      entityType: "Organization",
      entityId: organizationId,
      status: "pending",
      priority: -1,
      assignedAt: new Date().toISOString(),
      title: "Initialize agent team (INITIALIZE.md)",
      metadata: {
        playbook: "INITIALIZE.md",
      },
    },
  ];
}

async function buildSuperOrchestratorInbox(
  organizationId: string,
  payload: Record<string, unknown>,
): Promise<InboxWorkItem[]> {
  const [init, delegate, complianceDelegate, governance] = await Promise.all([
    buildTeamInitializationInbox(organizationId),
    buildReleaseDelegateInbox(organizationId, payload),
    buildComplianceDelegateInbox(organizationId, payload),
    buildGovernanceInbox(organizationId, payload),
  ]);

  const byId = new Map<string, InboxWorkItem>();
  for (const item of [...init, ...delegate, ...complianceDelegate, ...governance]) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort((a, b) => a.priority - b.priority);
}

async function buildSpecialistInbox(
  agent: Pick<AgentRegistry, "organizationId" | "agentType" | "role">,
  payload: Record<string, unknown>,
): Promise<InboxWorkItem[]> {
  const role = resolveEffectiveRole(agent);
  const items: InboxWorkItem[] = [];

  if (role === "qa_intelligence" || agent.agentType === "QA_INTELLIGENCE") {
    items.push(...(await buildQaInbox(agent.organizationId)));
  }

  if (role === "governance" || agent.agentType === "GOVERNANCE") {
    items.push(...(await buildGovernanceInbox(agent.organizationId, payload)));
  }

  if (role === "integration" || agent.agentType === "INTEGRATION") {
    items.push(...(await buildWebhookInbox(agent.organizationId, payload)));
  }

  if (role === "devops_intelligence" || agent.agentType === "DEVOPS_INTELLIGENCE") {
    items.push(...(await buildTelemetryInbox(agent.organizationId, payload)));
  }

  if (role === "qa_intelligence" && typeof payload.releaseId === "string") {
    const release = await prisma.release.findFirst({
      where: { id: payload.releaseId, organizationId: agent.organizationId },
    });
    if (release && !items.some((i) => i.entityId === release.id)) {
      items.push({
        id: inboxItemId("release_assess", release.id),
        workType: "release_assess",
        entityType: "Release",
        entityId: release.id,
        status: "pending",
        priority: 0,
        assignedAt: release.detectedAt.toISOString(),
        title: `Assess release: ${release.name}`,
        metadata: {
          environment: release.environment,
          delegated: true,
        },
      });
    }
  }

  const byId = new Map<string, InboxWorkItem>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => a.priority - b.priority);
}

/** Build virtual inbox items from domain entities (no AgentWorkItem table). */
export async function buildAgentInbox(
  agent: Pick<AgentRegistry, "id" | "organizationId" | "agentType" | "role">,
  wakeupPayload: Record<string, unknown> = {},
): Promise<InboxWorkItem[]> {
  if (agent.agentType === "SUPER_ORCHESTRATOR") {
    return buildSuperOrchestratorInbox(agent.organizationId, wakeupPayload);
  }

  return buildSpecialistInbox(agent, wakeupPayload);
}
