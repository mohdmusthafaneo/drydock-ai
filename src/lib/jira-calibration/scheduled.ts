import { prisma } from "@/lib/prisma";
import { parseJiraMeta } from "@/lib/jira-meta";
import { enqueueJiraCalibration, runJiraCalibrationForProject } from "@/lib/jira-calibration/run";
import { resetStuckCalibratingProfiles } from "@/lib/jira-calibration/status";

const DEFAULT_RECALIBRATE_AFTER_DAYS = 90;

export type ScheduledJiraCalibrationOrgResult = {
  organizationId: string;
  status: "calibrated" | "needs_review" | "skipped" | "failed";
  reason?: string;
  projectResults?: Array<{ projectKey: string; status: string; error?: string }>;
};

export async function runScheduledJiraCalibration(input?: {
  organizationId?: string;
  force?: boolean;
  recalibrateAfterDays?: number;
}): Promise<{
  attempted: number;
  calibrated: number;
  skipped: number;
  failed: number;
  results: ScheduledJiraCalibrationOrgResult[];
}> {
  const integrations = await prisma.integration.findMany({
    where: {
      provider: "JIRA",
      status: "CONNECTED",
      ...(input?.organizationId ? { organizationId: input.organizationId } : {}),
    },
    select: { organizationId: true, metadataJson: true },
    orderBy: { organizationId: "asc" },
  });

  const recalibrateAfterDays = input?.recalibrateAfterDays ?? DEFAULT_RECALIBRATE_AFTER_DAYS;
  const recalibrateCutoff = new Date(Date.now() - recalibrateAfterDays * 86400000);
  const results: ScheduledJiraCalibrationOrgResult[] = [];

  for (const integration of integrations) {
    const { organizationId } = integration;
    await resetStuckCalibratingProfiles(organizationId);
    const projectKeys = parseJiraMeta(integration.metadataJson).projectKeys ?? [];

    if (projectKeys.length === 0) {
      results.push({
        organizationId,
        status: "skipped",
        reason: "no_projects_selected",
      });
      continue;
    }

    const profiles = await prisma.jiraCalibrationProfile.findMany({
      where: { organizationId, projectKey: { in: projectKeys } },
      select: { projectKey: true, status: true, calibratedAt: true },
    });
    const profileByKey = new Map(profiles.map((p) => [p.projectKey, p]));

    const keysToRun = projectKeys.filter((key) => {
      if (input?.force) return true;
      const row = profileByKey.get(key);
      if (!row) return true;
      if (row.status === "pending" || row.status === "failed" || row.status === "calibrating") {
        return true;
      }
      if (
        (row.status === "calibrated" || row.status === "needs_review") &&
        row.calibratedAt &&
        row.calibratedAt < recalibrateCutoff
      ) {
        return true;
      }
      return false;
    });

    if (keysToRun.length === 0) {
      results.push({
        organizationId,
        status: "skipped",
        reason: "already_calibrated",
      });
      continue;
    }

    const projectResults: ScheduledJiraCalibrationOrgResult["projectResults"] = [];

    for (const projectKey of keysToRun) {
      const existing = profileByKey.get(projectKey);
      if (
        !input?.force &&
        existing &&
        (existing.status === "calibrated" || existing.status === "needs_review") &&
        existing.calibratedAt &&
        existing.calibratedAt >= recalibrateCutoff
      ) {
        projectResults.push({ projectKey, status: "skipped" });
        continue;
      }

      const result = await runJiraCalibrationForProject({
        organizationId,
        projectKey,
        force: input?.force,
      });
      if (result.status === "failed") {
        projectResults.push({ projectKey, status: "failed", error: result.error });
      } else if (result.status === "skipped") {
        projectResults.push({ projectKey, status: "skipped" });
      } else {
        projectResults.push({ projectKey, status: result.status });
      }
    }

    const anyFailed = projectResults.some((r) => r.status === "failed");
    const anyCalibrated = projectResults.some(
      (r) => r.status === "calibrated" || r.status === "needs_review",
    );

    results.push({
      organizationId,
      status: anyFailed ? "failed" : anyCalibrated ? "calibrated" : "skipped",
      projectResults,
    });
  }

  if (input?.organizationId && integrations.length === 0) {
    results.push({
      organizationId: input.organizationId,
      status: "skipped",
      reason: "jira_not_connected",
    });
  }

  return {
    attempted: results.length,
    calibrated: results.filter((r) => r.status === "calibrated" || r.status === "needs_review")
      .length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

export { enqueueJiraCalibration };
