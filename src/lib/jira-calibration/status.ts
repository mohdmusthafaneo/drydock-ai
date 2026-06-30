import { prisma } from "@/lib/prisma";
import { parseJiraMeta } from "@/lib/jira-meta";
import type { JiraCalibrationStatus } from "@/lib/jira-calibration/types";

export type JiraCalibrationGate = {
  status: JiraCalibrationStatus | "not_applicable";
  calibrated: boolean;
  pendingProjects: string[];
  message?: string;
};

const COMPLETE_STATUSES = new Set<JiraCalibrationStatus>(["calibrated", "needs_review"]);

/** Whether delivery scores should be gated pending calibration. */
export async function getJiraCalibrationGate(
  organizationId: string,
): Promise<JiraCalibrationGate> {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "JIRA" },
    },
    select: { status: true, metadataJson: true },
  });

  if (!integration || integration.status !== "CONNECTED") {
    return { status: "not_applicable", calibrated: true, pendingProjects: [] };
  }

  const projectKeys = parseJiraMeta(integration.metadataJson).projectKeys ?? [];
  if (projectKeys.length === 0) {
    return {
      status: "pending",
      calibrated: false,
      pendingProjects: [],
      message: "Select Jira projects before calibration",
    };
  }

  const profiles = await prisma.jiraCalibrationProfile.findMany({
    where: { organizationId, projectKey: { in: projectKeys } },
    select: { projectKey: true, status: true },
  });

  const byKey = new Map(profiles.map((p) => [p.projectKey, p.status as JiraCalibrationStatus]));
  const pendingProjects = projectKeys.filter((key) => {
    const status = byKey.get(key);
    return !status || !COMPLETE_STATUSES.has(status);
  });

  if (pendingProjects.length === 0) {
    return { status: "calibrated", calibrated: true, pendingProjects: [] };
  }

  const activeStatus =
    profiles.find((p) => p.status === "calibrating")?.status ??
    profiles.find((p) => p.status === "failed")?.status ??
    "pending";

  return {
    status: activeStatus as JiraCalibrationStatus,
    calibrated: false,
    pendingProjects,
    message:
      activeStatus === "calibrating"
        ? "Calibrating Jira workflow from 90-day history…"
        : "Jira workflow calibration pending — delivery scores use discounted confidence",
  };
}

export async function isJiraCalibrationComplete(organizationId: string): Promise<boolean> {
  const gate = await getJiraCalibrationGate(organizationId);
  return gate.calibrated;
}
