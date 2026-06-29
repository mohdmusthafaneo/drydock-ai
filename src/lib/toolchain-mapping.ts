import type { Integration, OrganizationProfile } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import {
  isJiraOAuthConnected,
  parseJiraMeta,
  type JiraFieldRef,
  type JiraSchemaSnapshot,
} from "@/lib/jira-meta";
import { suggestionConfidence } from "@/lib/jira-introspection";
import type { GitHubSchemaSnapshot } from "@/lib/github-introspection";

/** Org-specific semantics for Jira/GitHub — confirmed after integration sync. */
export type ToolchainMapping = {
  jira?: {
    methodology: "scrum" | "kanban" | "mixed" | "custom";
    boardType?: string;
    usesSprints: boolean;
    releaseTracking: "fixVersion" | "sprint" | "labels" | "none";
    blockedStatusName: string;
    blockedStatusId?: string;
    bugIssueType: string;
    bugIssueTypeId?: string;
    doneStatusCategory: "Done" | "Complete" | "Closed";
    doneStatusNames?: string[];
    storyPointField?: JiraFieldRef;
    releaseLabelPrefix?: string;
    sprintField?: JiraFieldRef;
    projectOverrides?: Record<string, Partial<ToolchainMapping["jira"]>>;
  };
  github?: {
    primaryDefaultBranch: string;
    branchStrategy: "trunk" | "gitflow" | "release-branches" | "custom";
    tracksPrsForRelease: boolean;
    releaseBranchPattern?: string;
    productionBranch?: string;
  };
  inferredFrom?: {
    jiraSyncedAt?: string;
    githubSyncedAt?: string;
    jiraSchemaSyncedAt?: string;
    discoveryWorkflows?: string[];
    suggestionConfidence?: "high" | "medium" | "low";
  };
  confirmedAt?: string;
};

export function applyJiraSchemaSuggestions(
  mapping: ToolchainMapping,
  schema: JiraSchemaSnapshot,
): ToolchainMapping {
  const s = schema.suggestions;
  const jira = mapping.jira;
  if (!jira) return mapping;

  return {
    ...mapping,
    jira: {
      ...jira,
      blockedStatusName: s.blockedStatus?.name ?? jira.blockedStatusName,
      blockedStatusId: s.blockedStatus?.id || undefined,
      bugIssueType: s.bugIssueType?.name ?? jira.bugIssueType,
      bugIssueTypeId: s.bugIssueType?.id || undefined,
      releaseTracking: s.releaseTracking?.mode ?? jira.releaseTracking,
      storyPointField: s.storyPointField
        ? { id: s.storyPointField.id, name: s.storyPointField.name }
        : jira.storyPointField,
    },
    inferredFrom: {
      ...mapping.inferredFrom,
      jiraSchemaSyncedAt: schema.syncedAt,
      suggestionConfidence: suggestionConfidence(s),
    },
  };
}

export function parseToolchainMapping(json: string | null | undefined): ToolchainMapping {
  try {
    const parsed = JSON.parse(json || "{}") as ToolchainMapping;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function resolveConfirmedToolchainMapping(
  organizationId: string,
): Promise<ToolchainMapping | null> {
  const profile = await prisma.organizationProfile.findUnique({
    where: { organizationId },
  });
  if (!profile?.toolchainMappingConfirmedAt) return null;
  return parseToolchainMapping(profile.toolchainMappingJson);
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
  githubSchema?: GitHubSchemaSnapshot,
): NonNullable<ToolchainMapping["github"]> {
  const suggestion = githubSchema?.suggestions;
  const primaryDefaultBranch =
    suggestion?.productionBranch?.value ?? defaultBranches[0] ?? "main";

  let branchStrategy: "trunk" | "gitflow" | "release-branches" | "custom" = "trunk";
  if (suggestion?.branchStrategy?.value) {
    const v = suggestion.branchStrategy.value;
    if (v === "gitflow" || v === "release-branches" || v === "trunk" || v === "custom") {
      branchStrategy = v;
    }
  } else if (discoveryWorkflows.includes("gitflow")) {
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
    productionBranch: suggestion?.productionBranch?.value,
    releaseBranchPattern:
      branchStrategy === "release-branches" ? "release/*" : undefined,
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

    if (meta.jiraSchemaSnapshot) {
      Object.assign(mapping, applyJiraSchemaSuggestions(mapping, meta.jiraSchemaSnapshot));
    }
  }

  const github = input.integrations.find((i) => i.provider === "GITHUB");
  if (github?.status === "CONNECTED") {
    const meta = parseIntegrationMeta(github.metadataJson);
    const defaultBranches = (meta.repos ?? []).map((r) => r.defaultBranch).filter(Boolean);
    const githubSchema = meta.githubSchemaSnapshot as GitHubSchemaSnapshot | undefined;
    mapping.github = inferGithubMapping(defaultBranches, discoveryWorkflows, githubSchema);
    mapping.inferredFrom!.githubSyncedAt = github.lastSyncAt?.toISOString();
  }

  return mapping;
}

/** Merge org Jira baseline with per-project overrides (used by hygiene + agent tools). */
export function resolveJiraMappingForProject(
  mapping: ToolchainMapping | null | undefined,
  projectKey: string,
): NonNullable<ToolchainMapping["jira"]> | undefined {
  const jira = mapping?.jira;
  if (!jira) return undefined;
  const override = jira.projectOverrides?.[projectKey];
  if (!override) return jira;
  return {
    ...jira,
    ...override,
    projectOverrides: jira.projectOverrides,
  };
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
