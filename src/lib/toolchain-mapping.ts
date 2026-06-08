import type { Integration, OrganizationProfile } from "@/generated/prisma/client";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { isJiraOAuthConnected, parseJiraMeta } from "@/lib/jira-meta";

/** Org-specific semantics for Jira/GitHub — confirmed after integration sync. */
export type ToolchainMapping = {
  jira?: {
    methodology: "scrum" | "kanban" | "mixed" | "custom";
    boardType?: string;
    usesSprints: boolean;
    releaseTracking: "fixVersion" | "sprint" | "labels" | "none";
    blockedStatusName: string;
    bugIssueType: string;
    doneStatusCategory: "Done" | "Complete" | "Closed";
    storyPointField?: string;
  };
  github?: {
    primaryDefaultBranch: string;
    branchStrategy: "trunk" | "gitflow" | "release-branches" | "custom";
    tracksPrsForRelease: boolean;
  };
  inferredFrom?: {
    jiraSyncedAt?: string;
    githubSyncedAt?: string;
    discoveryWorkflows?: string[];
  };
  confirmedAt?: string;
};

export function parseToolchainMapping(json: string | null | undefined): ToolchainMapping {
  try {
    const parsed = JSON.parse(json || "{}") as ToolchainMapping;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function inferJiraMethodology(
  boardType: string | undefined,
  hasActiveSprint: boolean,
  discoveryWorkflows: string[],
): NonNullable<ToolchainMapping["jira"]> {
  let methodology: "scrum" | "kanban" | "mixed" | "custom" = "custom";
  if (boardType === "scrum" || (hasActiveSprint && boardType !== "kanban")) {
    methodology = "scrum";
  } else if (boardType === "kanban") {
    methodology = "kanban";
  } else if (discoveryWorkflows.includes("scrum")) {
    methodology = "scrum";
  } else if (discoveryWorkflows.includes("kanban")) {
    methodology = "kanban";
  }

  return {
    methodology,
    boardType,
    usesSprints: methodology === "scrum" || hasActiveSprint,
    releaseTracking: "fixVersion",
    blockedStatusName: "Blocked",
    bugIssueType: "Bug",
    doneStatusCategory: "Done",
  };
}

function inferGithubMapping(
  defaultBranches: string[],
  discoveryWorkflows: string[],
): NonNullable<ToolchainMapping["github"]> {
  const primaryDefaultBranch = defaultBranches[0] ?? "main";
  let branchStrategy: "trunk" | "gitflow" | "release-branches" | "custom" = "trunk";

  if (discoveryWorkflows.includes("gitflow")) {
    branchStrategy = "gitflow";
  } else if (defaultBranches.some((b) => b === "develop" || b === "development")) {
    branchStrategy = "gitflow";
  } else if (defaultBranches.some((b) => b.startsWith("release/"))) {
    branchStrategy = "release-branches";
  }

  return {
    primaryDefaultBranch,
    branchStrategy,
    tracksPrsForRelease: true,
  };
}

/** Suggest defaults from first sync snapshots + discovery self-report. */
export function inferToolchainMapping(input: {
  profile: OrganizationProfile | null;
  integrations: Integration[];
}): ToolchainMapping {
  const discoveryWorkflows = input.profile
    ? (JSON.parse(input.profile.workflowsJson || "[]") as string[])
    : [];

  const mapping: ToolchainMapping = {
    inferredFrom: { discoveryWorkflows },
  };

  const jira = input.integrations.find((i) => i.provider === "JIRA");
  if (jira && isJiraOAuthConnected(jira)) {
    const meta = parseJiraMeta(jira.metadataJson);
    const snapshot = meta.deliverySnapshot;
    const primaryProject = snapshot?.projects[0];
    const boardType = primaryProject?.board?.type;
    const hasActiveSprint = Boolean(primaryProject?.activeSprint);

    mapping.jira = inferJiraMethodology(boardType, hasActiveSprint, discoveryWorkflows);
    mapping.inferredFrom!.jiraSyncedAt = snapshot?.syncedAt ?? jira.lastSyncAt?.toISOString();
  }

  const github = input.integrations.find((i) => i.provider === "GITHUB");
  if (github?.status === "CONNECTED") {
    const meta = parseIntegrationMeta(github.metadataJson);
    const defaultBranches = (meta.repos ?? []).map((r) => r.defaultBranch).filter(Boolean);
    mapping.github = inferGithubMapping(defaultBranches, discoveryWorkflows);
    mapping.inferredFrom!.githubSyncedAt = github.lastSyncAt?.toISOString();
  }

  return mapping;
}

export function mergeToolchainMapping(
  inferred: ToolchainMapping,
  saved: ToolchainMapping,
): ToolchainMapping {
  return {
    ...inferred,
    ...saved,
    jira: saved.jira ?? inferred.jira,
    github: saved.github ?? inferred.github,
    inferredFrom: inferred.inferredFrom,
    confirmedAt: saved.confirmedAt,
  };
}

export function hasIntegrationSyncForToolchainDiscovery(integrations: Integration[]): boolean {
  const jira = integrations.find((i) => i.provider === "JIRA" && i.status === "CONNECTED");
  const github = integrations.find((i) => i.provider === "GITHUB" && i.status === "CONNECTED");

  const jiraReady = jira ? Boolean(parseJiraMeta(jira.metadataJson).deliverySnapshot) : false;
  const githubReady = github ? Boolean(parseIntegrationMeta(github.metadataJson).repos?.length) : false;

  return jiraReady || githubReady;
}
