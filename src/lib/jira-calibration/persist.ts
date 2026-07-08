import { prisma } from "@/lib/prisma";
import type {
  CalibrationObservations,
  CalibratedWorkflowProfile,
  JiraCalibrationStatus,
} from "@/lib/jira-calibration/types";
import { parseCalibratedWorkflowProfile } from "@/lib/jira-calibration/types";
import {
  mergeCalibrationIntoMapping,
  parseToolchainMapping,
  type ToolchainMapping,
} from "@/lib/toolchain-mapping";

export async function upsertCalibrationProfile(input: {
  organizationId: string;
  projectKey: string;
  status: JiraCalibrationStatus;
  windowDays: number;
  observed?: CalibrationObservations;
  profile?: CalibratedWorkflowProfile;
  llmRationale?: string;
  source?: "deterministic" | "llm_calibrated";
  confidence?: string;
}): Promise<void> {
  const calibratedAt =
    input.status === "calibrated" || input.status === "needs_review"
      ? new Date()
      : undefined;

  await prisma.jiraCalibrationProfile.upsert({
    where: {
      organizationId_projectKey: {
        organizationId: input.organizationId,
        projectKey: input.projectKey,
      },
    },
    create: {
      organizationId: input.organizationId,
      projectKey: input.projectKey,
      status: input.status,
      windowDays: input.windowDays,
      observedJson: input.observed ? JSON.stringify(input.observed) : "{}",
      profileJson: input.profile ? JSON.stringify(input.profile) : "{}",
      llmRationale: input.llmRationale,
      confidence: input.confidence ?? input.profile?.confidence ?? input.observed?.confidence,
      source: input.source ?? "deterministic",
      calibratedAt,
    },
    update: {
      status: input.status,
      windowDays: input.windowDays,
      ...(input.observed ? { observedJson: JSON.stringify(input.observed) } : {}),
      ...(input.profile ? { profileJson: JSON.stringify(input.profile) } : {}),
      ...(input.llmRationale !== undefined ? { llmRationale: input.llmRationale } : {}),
      ...(input.confidence ? { confidence: input.confidence } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(calibratedAt ? { calibratedAt } : {}),
    },
  });
}

export async function listCalibrationProfiles(organizationId: string) {
  return prisma.jiraCalibrationProfile.findMany({
    where: { organizationId },
    orderBy: { projectKey: "asc" },
  });
}

export async function getCalibratedProfiles(organizationId: string): Promise<
  Array<{
    projectKey: string;
    profile: CalibratedWorkflowProfile;
    confidence: string | null;
    calibratedAt: Date | null;
  }>
> {
  const rows = await prisma.jiraCalibrationProfile.findMany({
    where: {
      organizationId,
      status: { in: ["calibrated", "needs_review"] },
    },
  });

  return rows
    .map((row) => {
      const profile = parseCalibratedWorkflowProfile(row.profileJson);
      if (!profile) return null;
      return {
        projectKey: row.projectKey,
        profile,
        confidence: row.confidence,
        calibratedAt: row.calibratedAt,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

export function observationsToDeterministicProfile(
  observations: CalibrationObservations,
): CalibratedWorkflowProfile {
  return {
    methodology: observations.methodology,
    usesSprints: observations.sprintCadence?.usesSprints ?? observations.methodology === "scrum",
    releaseTracking: observations.releaseTrackingEvidence.suggestedMode,
    blockedStatusName: observations.inferredBlockedStatusName,
    doneStatusNames: observations.inferredDoneStatusNames,
    doneStatusCategory: "Done",
    hygieneBaselines: observations.hygieneBaselines,
    confidence: observations.confidence,
  };
}

/** Merge calibrated Jira semantics into org toolchain mapping (persists sprint/fixVersion mode). */
export async function persistCalibratedToolchainMapping(input: {
  organizationId: string;
  profile: CalibratedWorkflowProfile;
  projectKey?: string;
  calibratedAt?: Date;
  confidence?: string;
}): Promise<ToolchainMapping> {
  const orgProfile = await prisma.organizationProfile.findUnique({
    where: { organizationId: input.organizationId },
    select: { toolchainMappingJson: true },
  });

  const existing = parseToolchainMapping(orgProfile?.toolchainMappingJson);
  const merged = mergeCalibrationIntoMapping(existing, input.profile, {
    projectKey: input.projectKey,
    calibratedAt: input.calibratedAt?.toISOString(),
    confidence: (input.confidence as "high" | "medium" | "low" | undefined) ?? input.profile.confidence,
  });

  await prisma.organizationProfile.update({
    where: { organizationId: input.organizationId },
    data: {
      toolchainMappingJson: JSON.stringify(merged),
    },
  });

  return merged;
}
