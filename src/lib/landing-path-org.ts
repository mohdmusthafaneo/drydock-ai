import "server-only";

import { computeCompletedStepIds } from "@/lib/enterprise-workflow";
import { hasObservabilitySynced } from "@/lib/observability-connectivity";
import { resolveLandingPath } from "@/lib/landing-path";
import { prisma } from "@/lib/prisma";
import type { WorkspaceMode } from "@/lib/workspace-mode";

export async function getLandingPathForOrganization(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { workspaceMode: true },
  });
  const mode = (org?.workspaceMode ?? "MVP") as WorkspaceMode;

  if (mode === "MVP") {
    const dna = await prisma.deliveryDNA.findUnique({
      where: { organizationId },
      select: { id: true },
    });
    return resolveLandingPath({ mode, hasDna: Boolean(dna) });
  }

  const [profile, dna, integrations, releases, approvals, workflow, incidents] =
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
    ]);

  const assessedReleases = releases.filter((r) => r.assessedAt);
  const deployedReleases = releases.filter((r) => r.status === "DEPLOYED");
  const pendingApprovals = approvals.filter((a) => !a.decision);
  const hasObservabilitySyncedFlag = hasObservabilitySynced(integrations);

  const completedStepIds = computeCompletedStepIds({
    hasDna: Boolean(dna),
    hasProfile: Boolean(profile?.completedAt),
    connectedCount: integrations.length,
    toolchainMappingConfirmed: Boolean(profile?.toolchainMappingConfirmedAt),
    workflowConfigured: Boolean(workflow?.configuredAt),
    hasAssessedRelease: assessedReleases.length > 0,
    hasPendingApprovals: pendingApprovals.length > 0,
    hasDeployedRelease: deployedReleases.length > 0,
    hasOpenIncident: incidents.length > 0,
    hasObservabilitySynced: hasObservabilitySyncedFlag,
  });

  return resolveLandingPath({
    mode: "ENTERPRISE",
    hasDna: Boolean(dna),
    completedStepIds,
  });
}
