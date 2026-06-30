import { prisma } from "@/lib/prisma";
import { parseJiraMeta } from "@/lib/jira-meta";
import { enqueueJiraCalibration, runJiraCalibrationForProject } from "@/lib/jira-calibration/run";

export type ScheduledJiraCalibrationOrgResult = {
  organizationId: string;
  status: "calibrated" | "needs_review" | "skipped" | "failed";
  reason?: string;
  projectResults?: Array<{ projectKey: string; status: string; error?: string }>;
};

export async function runScheduledJiraCalibration(input?: {
  organizationId?: string;
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

  const results: ScheduledJiraCalibrationOrgResult[] = [];

  for (const integration of integrations) {
    const { organizationId } = integration;
    const projectKeys = parseJiraMeta(integration.metadataJson).projectKeys ?? [];

    if (projectKeys.length === 0) {
      results.push({
        organizationId,
        status: "skipped",
        reason: "no_projects_selected",
      });
      continue;
    }

    const pending = await prisma.jiraCalibrationProfile.findMany({
      where: {
        organizationId,
        projectKey: { in: projectKeys },
        status: { in: ["pending", "failed", "calibrating"] },
      },
      select: { projectKey: true, status: true },
    });

    const pendingKeys = new Set(pending.map((p) => p.projectKey));
    const keysToRun = projectKeys.filter(
      (key) => pendingKeys.has(key) || !pending.some((p) => p.projectKey === key),
    );

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
      const existing = await prisma.jiraCalibrationProfile.findUnique({
        where: {
          organizationId_projectKey: { organizationId, projectKey },
        },
        select: { status: true },
      });
      if (existing?.status === "calibrated" || existing?.status === "needs_review") {
        projectResults.push({ projectKey, status: "skipped" });
        continue;
      }

      const result = await runJiraCalibrationForProject({ organizationId, projectKey });
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
