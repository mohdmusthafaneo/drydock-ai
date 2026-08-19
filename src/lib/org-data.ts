import { forOrgRead } from "@/lib/prisma";
import { parseGovernancePolicy } from "@/lib/governance/policy";
import type { ApprovalLevelLabels } from "@/lib/governance/policy";
import { computeCompletedStepIds } from "@/lib/enterprise-workflow";
import { hasObservabilitySynced } from "@/lib/observability-connectivity";
import { isJiraCalibrationComplete } from "@/lib/jira-calibration/status";
import { isLeadershipPendingApproval } from "@/lib/recommendation-queue";
import { auditReadOnlyFilter } from "@/lib/audit-helpers";
export async function getOrganizationContext(organizationId: string) {
  const db = forOrgRead(organizationId);
  const [
    org,
    profile,
    dna,
    integrations,
    recommendations,
    approvals,
    events,
    releases,
    workflow,
    incidents,
    auditLogs,
    telemetryMetrics,
    deploymentEvents,
    telemetryEvents,
    webhookEvents,
    governancePolicy,
  ] = await Promise.all([
    // Organization is the tenant root — query by id on the scoped client is fine
    // (Organization is not in TENANT_MODELS, so forOrg does not rewrite it).
    db.organization.findUnique({ where: { id: organizationId } }),
    db.organizationProfile.findUnique({ where: { organizationId } }),
    db.deliveryDNA.findUnique({ where: { organizationId } }),
    db.integration.findMany({
      where: { organizationId },
      orderBy: { provider: "asc" },
    }),
    db.recommendation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { release: true },
    }),
    db.approval.findMany({
      where: { organizationId },
      include: {
        recommendation: { include: { release: true } },
        approver: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.activityEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.release.findMany({
      where: { organizationId },
      orderBy: [{ detectedAt: "desc" }, { createdAt: "desc" }],
    }),
    db.deliveryWorkflow.findUnique({ where: { organizationId } }),
    db.incident.findMany({
      where: { organizationId },
      orderBy: { detectedAt: "desc" },
      take: 20,
      include: { release: true },
    }),
    db.auditLog.findMany({
      where: { organizationId, ...auditReadOnlyFilter() },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: true },
    }),
    db.telemetryMetric.findMany({
      where: { organizationId },
      orderBy: { recordedAt: "desc" },
      take: 48,
    }),
    db.deploymentEvent.findMany({
      where: { organizationId },
      orderBy: { deployedAt: "desc" },
      take: 10,
      include: { release: true },
    }),
    db.telemetryEvent.findMany({
      where: { organizationId },
      orderBy: { occurredAt: "desc" },
      take: 24,
    }),
    db.webhookEvent.findMany({
      where: { organizationId },
      orderBy: { receivedAt: "desc" },
      take: 12,
    }),
    db.governancePolicy.findUnique({ where: { organizationId } }),
  ]);

  const leadershipPending = approvals.filter(isLeadershipPendingApproval);
  const pendingReleaseApprovals = leadershipPending.filter(
    (a) => a.recommendation?.queue === "RELEASE_GATE",
  ).length;
  const pendingGovernanceApprovals = leadershipPending.filter(
    (a) => a.recommendation?.queue === "GOVERNANCE",
  ).length;
  const pendingApprovals = pendingReleaseApprovals + pendingGovernanceApprovals;
  const pendingSetupTasks = recommendations.filter(
    (r) => r.status === "PENDING" && r.queue === "SETUP",
  ).length;
  const connectedIntegrations = integrations.filter((i) => i.status === "CONNECTED");
  const activeReleases = releases.filter(
    (r) => r.status !== "DEPLOYED" && r.status !== "BLOCKED",
  );
  const assessedReleases = releases.filter((r) => r.assessedAt);
  const deployedReleases = releases.filter((r) => r.status === "DEPLOYED");

  const avgReadiness =
    assessedReleases.length > 0
      ? Math.round(
          assessedReleases.reduce((s, r) => s + (r.readinessScore ?? 0), 0) /
            assessedReleases.length,
        )
      : null;

  const latestMetrics = telemetryMetrics.slice(0, 12);
  const errorRate =
    latestMetrics.find((m) => m.metricKey === "http_error_rate")?.value ?? null;
  const p95 = latestMetrics.find((m) => m.metricKey === "p95_latency_ms")?.value ?? null;

  const workflowConfigured = Boolean(workflow?.configuredAt);
  const toolchainMappingConfirmed = Boolean(profile?.toolchainMappingConfirmedAt);
  const jiraConnected = connectedIntegrations.some((i) => i.provider === "JIRA");
  const jiraCalibrationComplete = jiraConnected
    ? await isJiraCalibrationComplete(organizationId)
    : true;
  const hasObservabilitySyncedFlag = hasObservabilitySynced(integrations);
  const completedStepIds = computeCompletedStepIds({
    hasDna: Boolean(dna),
    hasProfile: Boolean(profile?.completedAt),
    connectedCount: connectedIntegrations.length,
    toolchainMappingConfirmed,
    jiraConnected,
    jiraCalibrationComplete,
    workflowConfigured,
    hasAssessedRelease: assessedReleases.length > 0,
    hasPendingApprovals: leadershipPending.length > 0,
    hasDeployedRelease: deployedReleases.length > 0,
    hasOpenIncident: incidents.some((i) => i.status === "OPEN" || i.status === "INVESTIGATING"),
    hasObservabilitySynced: hasObservabilitySyncedFlag,
  });

  const degradedDeployments = deploymentEvents.filter(
    (d) => d.health === "DEGRADED" || d.health === "FAILED",
  );

  const parsedPolicy = parseGovernancePolicy(governancePolicy);

  return {
    org,
    profile,
    dna,
    integrations,
    recommendations,
    approvals,
    events,
    releases,
    workflow,
    incidents,
    auditLogs,
    telemetryMetrics,
    deploymentEvents,
    telemetryEvents,
    webhookEvents,
    governancePolicy,
    approvalLevelLabels: parsedPolicy.approvalLevelLabels ?? {},
    completedStepIds,
    stats: {
      governanceScore: dna?.governanceScore ?? 0,
      releaseReadiness: avgReadiness ?? (dna ? Math.min(100, dna.governanceScore) : 0),
      activeReleases: activeReleases.length,
      governanceRisk: releases[0]?.governanceRiskScore
        ? Math.round(releases[0].governanceRiskScore)
        : 0,
      pendingRecommendations: recommendations.filter(
        (r) => r.status === "PENDING" && r.queue !== "SETUP",
      ).length,
      pendingApprovals,
      pendingReleaseApprovals,
      pendingGovernanceApprovals,
      pendingSetupTasks,
      connectedTools: connectedIntegrations.length,
      openIncidents: incidents.filter((i) => i.status === "OPEN" || i.status === "INVESTIGATING")
        .length,
      auditEventCount: auditLogs.length,
      metricCount: telemetryMetrics.length,
      telemetryEventCount: telemetryEvents.length,
      webhookEventCount: webhookEvents.length,
      integrationsHealthy: integrations.filter(
        (i) => i.status === "CONNECTED" && !i.lastError,
      ).length,
      errorRate,
      p95Latency: p95,
      degradedDeployments: degradedDeployments.length,
      rollbackPending: deploymentEvents.filter((d) => d.rollbackRecommended).length,
    },
  };
}
