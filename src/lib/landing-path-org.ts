import "server-only";

import { computeCompletedStepIds } from "@/lib/enterprise-workflow";
import { hasObservabilitySynced } from "@/lib/observability-connectivity";
import { isJiraCalibrationComplete } from "@/lib/jira-calibration/status";
import { resolveLandingPath } from "@/lib/landing-path";
import { prisma } from "@/lib/prisma";

export async function getLandingPathForOrganization(organizationId: string): Promise<string> {
  const [profile, dna, integrations, releases, approvals, workflow, incidents, jiraCalibrationComplete] =
    await Promise.all([
      prisma.organizationProfile.findUnique({
        where: { organizationId },
        select: { completedAt: true, toolchainMappingConfirmedAt: true },
      }),
      prisma.deliveryDNA.findUnique({ where: { organizationId }, select: { id: true } }),
      prisma.integration.findMany({
        where: { organizationId, status: "CONNECTED" },
        select: { id: true, provider: true, status: true, metadataJson: true, lastSyncAt: true },
      }),
      prisma.release.findMany({
        where: { organizationId },
        select: { assessedAt: true, status: true },
      }),
      prisma.approval.findMany({
        where: { organizationId },
        select: { decision: true },
      }),
      prisma.deliveryWorkflow.findUnique({
        where: { organizationId },
        select: { configuredAt: true },
      }),
      prisma.incident.findMany({
        where: { organizationId, status: { in: ["OPEN", "INVESTIGATING"] } },
        select: { id: true },
        take: 1,
      }),
      isJiraCalibrationComplete(organizationId),
    ]);

  const assessedReleases = releases.filter((r) => r.assessedAt);
  const deployedReleases = releases.filter((r) => r.status === "DEPLOYED");
  const pendingApprovals = approvals.filter((a) => !a.decision);
  const hasObservabilitySyncedFlag = hasObservabilitySynced(integrations);

  const jiraConnected = integrations.some((i) => i.provider === "JIRA");

  const completedStepIds = computeCompletedStepIds({
    hasDna: Boolean(dna),
    hasProfile: Boolean(profile?.completedAt),
    connectedCount: integrations.length,
    toolchainMappingConfirmed: Boolean(profile?.toolchainMappingConfirmedAt),
    jiraConnected,
    jiraCalibrationComplete,
    workflowConfigured: Boolean(workflow?.configuredAt),
    hasAssessedRelease: assessedReleases.length > 0,
    hasPendingApprovals: pendingApprovals.length > 0,
    hasDeployedRelease: deployedReleases.length > 0,
    hasOpenIncident: incidents.length > 0,
    hasObservabilitySynced: hasObservabilitySyncedFlag,
  });

  return resolveLandingPath({
    hasDna: Boolean(dna),
    completedStepIds,
  });
}
