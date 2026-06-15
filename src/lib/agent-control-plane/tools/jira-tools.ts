import { prisma } from "@/lib/prisma";
import {
  applyJiraMetaPatch,
  countIssuesByJql,
  formatJiraSyncError,
  JiraApiError,
  resolveJiraAccessToken,
  searchIssuesByJql,
  type JiraIssueSummary,
} from "@/lib/jira-api";
import {
  buildBlockedJql,
  buildBugJql,
  buildDoneJql,
  buildOpenJql,
  jqlQuoteLiteral,
  LEGACY_JIRA_MAPPING,
  type JiraMappingSlice,
} from "@/lib/jira-jql";
import { parseJiraMeta } from "@/lib/jira-meta";
import { getConnectedJiraIntegration } from "@/lib/jira-project-selection";
import {
  parseToolchainMapping,
  type ToolchainMapping,
} from "@/lib/toolchain-mapping";

export const JIRA_JQL_PRESETS = [
  "open_bugs",
  "blocked",
  "open",
  "done",
] as const;

export type JiraJqlPreset = (typeof JIRA_JQL_PRESETS)[number];

export type QueryJiraJqlInput = {
  organizationId: string;
  jql?: string;
  preset?: JiraJqlPreset;
  mode?: "count" | "issues";
  maxResults?: number;
};

export type QueryJiraJqlResult =
  | {
      ok: true;
      jql: string;
      mode: "count" | "issues";
      projectKeys: string[];
      count: number;
      issues?: JiraIssueSummary[];
      nextPageToken?: string;
      queriedAt: string;
      preset?: JiraJqlPreset;
    }
  | {
      ok: false;
      error: string;
    };

function resolveJiraMapping(
  toolchainMapping: ToolchainMapping,
): JiraMappingSlice {
  const jira = toolchainMapping.jira;
  if (!jira) return LEGACY_JIRA_MAPPING;
  return {
    blockedStatusName: jira.blockedStatusName,
    bugIssueType: jira.bugIssueType,
    doneStatusCategory: jira.doneStatusCategory,
    doneStatusNames: jira.doneStatusNames,
  };
}

export function buildProjectScopeClause(projectKeys: string[]): string {
  if (projectKeys.length === 1) {
    return `project = ${jqlQuoteLiteral(projectKeys[0])}`;
  }
  return `project in (${projectKeys.map(jqlQuoteLiteral).join(", ")})`;
}

export function scopeJqlToProjects(jql: string, projectKeys: string[]): string {
  const trimmed = jql.trim();
  if (!trimmed) {
    throw new Error("JQL query is required");
  }
  if (projectKeys.length === 0) {
    throw new Error("No Jira projects selected for this organization");
  }

  if (/\bproject\s+(=|in)\s+/i.test(trimmed)) {
    return trimmed;
  }

  return `${buildProjectScopeClause(projectKeys)} AND (${trimmed})`;
}

function buildPresetJql(
  preset: JiraJqlPreset,
  projectKeys: string[],
  mapping: JiraMappingSlice,
): string {
  const baseJql = buildProjectScopeClause(projectKeys);
  switch (preset) {
    case "open_bugs":
      return buildBugJql(baseJql, mapping);
    case "blocked":
      return buildBlockedJql(baseJql, mapping);
    case "open":
      return buildOpenJql(baseJql, mapping);
    case "done":
      return buildDoneJql(baseJql, mapping);
  }
}

function resolveScopedJql(input: {
  jql?: string;
  preset?: JiraJqlPreset;
  projectKeys: string[];
  mapping: JiraMappingSlice;
}): string {
  if (input.preset) {
    return buildPresetJql(input.preset, input.projectKeys, input.mapping);
  }
  if (!input.jql?.trim()) {
    throw new Error("Provide jql or a preset");
  }
  return scopeJqlToProjects(input.jql, input.projectKeys);
}

export async function queryJiraJqlForOrganization(
  input: QueryJiraJqlInput,
): Promise<QueryJiraJqlResult> {
  const mode = input.mode ?? "issues";
  const maxResults = Math.min(input.maxResults ?? 20, 50);

  try {
    const integration = await getConnectedJiraIntegration(input.organizationId);
    const meta = parseJiraMeta(integration.metadataJson);
    const projectKeys = meta.projectKeys ?? [];

    if (projectKeys.length === 0) {
      return {
        ok: false,
        error:
          "Jira is connected but no sync projects are selected — choose projects in Integrations first",
      };
    }

    const profile = await prisma.organizationProfile.findUnique({
      where: { organizationId: input.organizationId },
    });
    const mapping = resolveJiraMapping(parseToolchainMapping(profile?.toolchainMappingJson));
    const jql = resolveScopedJql({
      jql: input.jql,
      preset: input.preset,
      projectKeys,
      mapping,
    });

    const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);
    if (metaPatch) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { metadataJson: applyJiraMetaPatch(integration, metaPatch) },
      });
    }

    const queriedAt = new Date().toISOString();

    if (mode === "count") {
      const count = await countIssuesByJql(accessToken, cloudId, jql);
      return {
        ok: true,
        jql,
        mode,
        projectKeys,
        count,
        queriedAt,
        preset: input.preset,
      };
    }

    const search = await searchIssuesByJql(accessToken, cloudId, {
      jql,
      maxResults,
    });
    const count = await countIssuesByJql(accessToken, cloudId, jql);

    return {
      ok: true,
      jql,
      mode,
      projectKeys,
      count,
      issues: search.issues,
      nextPageToken: search.nextPageToken,
      queriedAt,
      preset: input.preset,
    };
  } catch (err) {
    if (err instanceof JiraApiError) {
      return { ok: false, error: formatJiraSyncError(err) };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Jira query failed",
    };
  }
}
