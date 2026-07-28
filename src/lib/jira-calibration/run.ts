import { prisma } from "@/lib/prisma";
import { parseJiraMeta } from "@/lib/jira-meta";
import { analyzeCalibrationSample } from "@/lib/jira-calibration/analyze";
import { fetchJiraCalibrationSample } from "@/lib/jira-calibration/fetch-sample";
import {
  observationsToDeterministicProfile,
  persistCalibratedToolchainMapping,
  upsertCalibrationProfile,
} from "@/lib/jira-calibration/persist";

export type RunJiraCalibrationResult =
  | { status: "calibrated"; projectKey: string; confidence: string }
  | { status: "needs_review"; projectKey: string; confidence: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; projectKey: string; error: string };

export async function runJiraCalibrationForProject(input: {
  organizationId: string;
  projectKey: string;
  windowDays?: number;
  force?: boolean;
}): Promise<RunJiraCalibrationResult> {
  const { organizationId, projectKey } = input;

  if (!input.force) {
    const existing = await prisma.jiraCalibrationProfile.findUnique({
      where: {
        organizationId_projectKey: { organizationId, projectKey },
      },
      select: { status: true },
    });
    if (existing?.status === "calibrating") {
      return { status: "skipped", reason: "already_calibrating" };
    }
  }

  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "JIRA" },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    return { status: "skipped", reason: "jira_not_connected" };
  }

  await upsertCalibrationProfile({
    organizationId,
    projectKey,
    status: "calibrating",
    windowDays: input.windowDays ?? 90,
  });

  try {
    const sample = await fetchJiraCalibrationSample({
      organizationId,
      projectKey,
      windowDays: input.windowDays,
    });
    const observations = analyzeCalibrationSample(sample);

    await upsertCalibrationProfile({
      organizationId,
      projectKey,
      status: "calibrating",
      windowDays: sample.windowDays,
      observed: observations,
      confidence: observations.confidence,
      source: "deterministic",
    });

    const profileResult = observationsToDeterministicProfile(observations);
    const source = "deterministic" as const;

    const finalStatus =
      profileResult.confidence === "low" ? "needs_review" : "calibrated";

    await upsertCalibrationProfile({
      organizationId,
      projectKey,
      status: finalStatus,
      windowDays: sample.windowDays,
      observed: observations,
      profile: profileResult,
      confidence: profileResult.confidence,
      source,
    });

    await persistCalibratedToolchainMapping({
      organizationId,
      profile: profileResult,
      projectKey,
      calibratedAt: new Date(),
      confidence: profileResult.confidence,
    });

    await prisma.activityEvent.create({
      data: {
        organizationId,
        type: "jira.calibration.completed",
        title: `Jira workflow calibrated (${projectKey})`,
        description: `90-day calibration complete with ${profileResult.confidence} confidence`,
        metadataJson: JSON.stringify({
          projectKey,
          confidence: profileResult.confidence,
          doneStatusNames: profileResult.doneStatusNames,
          source,
        }),
      },
    });

    return {
      status: finalStatus,
      projectKey,
      confidence: profileResult.confidence,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Calibration failed";
    await upsertCalibrationProfile({
      organizationId,
      projectKey,
      status: "failed",
      windowDays: input.windowDays ?? 90,
    });
    return { status: "failed", projectKey, error: message };
  }
}

/** Queue calibration for all synced project keys (fire-and-forget safe). */
export async function enqueueJiraCalibration(
  organizationId: string,
  projectKeys?: string[],
): Promise<void> {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "JIRA" },
    },
  });
  if (!integration || integration.status !== "CONNECTED") return;

  const keys =
    projectKeys ??
    parseJiraMeta(integration.metadataJson).projectKeys ??
    [];

  for (const projectKey of keys) {
    const existing = await prisma.jiraCalibrationProfile.findUnique({
      where: {
        organizationId_projectKey: { organizationId, projectKey },
      },
      select: { status: true },
    });
    if (existing?.status === "calibrated" || existing?.status === "calibrating") {
      continue;
    }
    void runJiraCalibrationForProject({ organizationId, projectKey });
  }
}
