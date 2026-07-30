import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { p as prisma } from '../prisma.mjs';
import { b as parseJiraMeta, a as providerCredentials, m as mergeJiraMeta, h as httpFetch, H as HttpResponseError, r as readJsonField, f as fetchJiraMyself } from '../provider-credentials.mjs';
import '@prisma/adapter-pg';
import 'pg';
import 'node:path';
import 'node:url';
import '@prisma/client/runtime/client';
import 'node:async_hooks';
import 'pino';
import 'ioredis';
import 'jose';
import 'node:crypto';
import '../token-crypto.mjs';

const JIRA_RECONNECT_MESSAGE = "Jira authorization expired or was revoked. Disconnect and reconnect Jira on this page to restore sync.";
function jiraErrorMessage$1(err) {
  return err instanceof Error ? err.message : String(err);
}
function isJiraReconnectError(err) {
  const lower = jiraErrorMessage$1(err).toLowerCase();
  return lower.includes("refresh_token") && lower.includes("invalid") || lower.includes("reconnect via oauth") || lower.includes("token missing") || lower.includes("access token expired") || lower.includes("token refresh failed");
}

class JiraApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
function jiraErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
function isJiraScopeError(err) {
  if (!(err instanceof JiraApiError) || err.status !== 401) return false;
  const lower = jiraErrorMessage(err).toLowerCase();
  return lower.includes("scope") || lower.includes("unauthorized");
}
function formatJiraSyncError(err) {
  if (err instanceof JiraApiError && err.status === 410) {
    return "Jira search API was updated by Atlassian. Restart the dev server and sync again.";
  }
  if (isJiraReconnectError(err)) {
    return JIRA_RECONNECT_MESSAGE;
  }
  if (isJiraScopeError(err)) {
    return "Jira OAuth scopes are insufficient for sync. In the Atlassian developer console, enable read:jira-work, read:project:jira, read:board-scope:jira-software, and read:sprint:jira-software for your app, then disconnect and reconnect Jira here.";
  }
  if (err instanceof JiraApiError) {
    return `Jira API error (${err.status}): ${parseJiraErrorBody(err.message)}`;
  }
  return err instanceof Error ? err.message : "Sync failed";
}
function parseJiraErrorBody(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.message) return parsed.message;
  } catch {
  }
  return raw.length > 200 ? `${raw.slice(0, 200)}\u2026` : raw;
}
function applyJiraMetaPatch(integration, patch) {
  return mergeJiraMeta(parseJiraMeta(integration.metadataJson), patch);
}
const JIRA_API = "https://api.atlassian.com/ex/jira";
async function jiraFetch(accessToken, cloudId, path, init, organizationId) {
  const url = path.startsWith("http") ? path : `${JIRA_API}/${cloudId}${path}`;
  let res;
  try {
    res = await httpFetch({
      url,
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...init?.headers ?? {}
      },
      body: init?.body ?? void 0,
      scope: { provider: "jira", organizationId }
    });
  } catch (err) {
    const status = err instanceof HttpResponseError ? err.status : 502;
    const text = err instanceof HttpResponseError ? err.bodyText ?? err.message : String(err);
    throw new JiraApiError(text || `Jira API error (${status})`, status);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new JiraApiError(text || `Jira API error (${res.status})`, res.status);
  }
  if (res.status === 204) return {};
  return res.json();
}
async function resolveJiraAccessToken(integration) {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.cloudId) {
    throw new Error("Missing cloudId in integration metadata");
  }
  const accessToken = await providerCredentials.getAccessToken(
    integration.organizationId,
    "JIRA"
  );
  return { accessToken, cloudId: meta.cloudId };
}
async function countIssuesByJql(accessToken, cloudId, jql) {
  const data = await jiraFetch(
    accessToken,
    cloudId,
    "/rest/api/3/search/approximate-count",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jql })
    }
  );
  return data.count ?? 0;
}
const DEFAULT_JIRA_SEARCH_FIELDS = [
  "summary",
  "status",
  "issuetype",
  "priority",
  "assignee"
];
function parseJiraIssueSummary(issue) {
  if (!issue.key) return null;
  return {
    key: issue.key,
    summary: issue.fields?.summary ?? "",
    status: issue.fields?.status?.name ?? "Unknown",
    issueType: issue.fields?.issuetype?.name ?? "Unknown",
    priority: issue.fields?.priority?.name,
    assignee: issue.fields?.assignee?.displayName
  };
}
async function searchIssuesByJql(accessToken, cloudId, input) {
  const data = await jiraFetch(accessToken, cloudId, "/rest/api/3/search/jql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jql: input.jql,
      maxResults: Math.min(input.maxResults ?? 20, 50),
      nextPageToken: input.nextPageToken,
      fields: input.fields ?? [...DEFAULT_JIRA_SEARCH_FIELDS]
    })
  });
  return {
    issues: (data.issues ?? []).map(parseJiraIssueSummary).filter((issue) => issue !== null),
    nextPageToken: data.nextPageToken
  };
}

const LEGACY_JIRA_MAPPING = {
  blockedStatusName: "Blocked",
  bugIssueType: "Bug",
  doneStatusCategory: "Done"
};
function jqlQuoteLiteral(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function buildNotDoneJql(mapping) {
  return `statusCategory != ${jqlQuoteLiteral(mapping.doneStatusCategory)}`;
}
function buildBlockedJql(baseJql, mapping) {
  return `${baseJql} AND (status = ${jqlQuoteLiteral(mapping.blockedStatusName)} OR labels = blocked) AND ${buildNotDoneJql(mapping)}`;
}
function buildBugJql(baseJql, mapping) {
  return `${baseJql} AND issuetype = ${jqlQuoteLiteral(mapping.bugIssueType)} AND ${buildNotDoneJql(mapping)}`;
}
function buildOpenJql(baseJql, mapping) {
  return `${baseJql} AND ${buildNotDoneJql(mapping)}`;
}
function buildDoneJql(baseJql, mapping) {
  const doneNames = mapping.doneStatusNames?.filter((name) => name.trim().length > 0);
  if (doneNames && doneNames.length > 0) {
    const inClause = doneNames.map((name) => jqlQuoteLiteral(name)).join(", ");
    return `${baseJql} AND status IN (${inClause})`;
  }
  return `${baseJql} AND statusCategory = ${jqlQuoteLiteral(mapping.doneStatusCategory)}`;
}

async function getConnectedJiraIntegration(organizationId) {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "JIRA"
      }
    }
  });
  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("Jira is not connected");
  }
  return integration;
}

function parseToolchainMapping(json) {
  const parsed = readJsonField(json, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

const JIRA_JQL_PRESETS = [
  "open_bugs",
  "blocked",
  "open",
  "done"
];
function resolveJiraMapping(toolchainMapping) {
  const jira = toolchainMapping.jira;
  if (!jira) return LEGACY_JIRA_MAPPING;
  return {
    blockedStatusName: jira.blockedStatusName,
    bugIssueType: jira.bugIssueType,
    doneStatusCategory: jira.doneStatusCategory,
    doneStatusNames: jira.doneStatusNames
  };
}
function buildProjectScopeClause(projectKeys) {
  if (projectKeys.length === 1) {
    return `project = ${jqlQuoteLiteral(projectKeys[0])}`;
  }
  return `project in (${projectKeys.map(jqlQuoteLiteral).join(", ")})`;
}
function scopeJqlToProjects(jql, projectKeys) {
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
function buildPresetJql(preset, projectKeys, mapping) {
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
function resolveScopedJql(input) {
  if (input.preset) {
    return buildPresetJql(input.preset, input.projectKeys, input.mapping);
  }
  if (!input.jql?.trim()) {
    throw new Error("Provide jql or a preset");
  }
  return scopeJqlToProjects(input.jql, input.projectKeys);
}
async function queryJiraJqlForOrganization(input) {
  const mode = input.mode ?? "issues";
  const maxResults = Math.min(input.maxResults ?? 20, 50);
  try {
    const integration = await getConnectedJiraIntegration(input.organizationId);
    const meta = parseJiraMeta(integration.metadataJson);
    const projectKeys = meta.projectKeys ?? [];
    if (projectKeys.length === 0) {
      return {
        ok: false,
        error: "Jira is connected but no sync projects are selected \u2014 choose projects in Integrations first"
      };
    }
    const profile = await prisma.organizationProfile.findUnique({
      where: { organizationId: input.organizationId }
    });
    const mapping = resolveJiraMapping(parseToolchainMapping(profile?.toolchainMappingJson));
    const jql = resolveScopedJql({
      jql: input.jql,
      preset: input.preset,
      projectKeys,
      mapping
    });
    const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);
    if (metaPatch) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { metadataJson: applyJiraMetaPatch(integration, metaPatch) }
      });
    }
    const queriedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (mode === "count") {
      const count2 = await countIssuesByJql(accessToken, cloudId, jql);
      return {
        ok: true,
        jql,
        mode,
        projectKeys,
        count: count2,
        queriedAt,
        preset: input.preset
      };
    }
    const search = await searchIssuesByJql(accessToken, cloudId, {
      jql,
      maxResults
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
      preset: input.preset
    };
  } catch (err) {
    if (err instanceof JiraApiError) {
      return { ok: false, error: formatJiraSyncError(err) };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Jira query failed"
    };
  }
}

const jiraMyselfTool = createTool({
  id: "jira-myself",
  description: "Fetch the authenticated Jira user via GET /rest/api/3/myself for an AIDOS organization. Authenticates from the org's connected Jira Integration (OAuth resolved server-side).",
  inputSchema: z.object({
    organizationId: z.string().min(1).describe("AIDOS organization id with a connected Jira integration")
  }),
  outputSchema: z.object({
    accountId: z.string().optional(),
    displayName: z.string().optional(),
    emailAddress: z.string().optional(),
    cloudId: z.string(),
    raw: z.record(z.string(), z.unknown())
  }),
  execute: async (inputData) => {
    const integration = await getConnectedJiraIntegration(
      inputData.organizationId
    );
    const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);
    if (metaPatch) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { metadataJson: applyJiraMetaPatch(integration, metaPatch) }
      });
    }
    const myself = await fetchJiraMyself(accessToken, cloudId);
    return {
      accountId: myself.accountId,
      displayName: myself.displayName,
      emailAddress: myself.emailAddress,
      cloudId,
      raw: { ...myself }
    };
  }
});
const jiraJqlTool = createTool({
  id: "jira-jql",
  description: "Run a JQL search (or preset) against the organization's connected Jira site. Queries are scoped to selected sync projects. Prefer presets when possible.",
  inputSchema: z.object({
    organizationId: z.string().min(1).describe("AIDOS organization id with a connected Jira integration"),
    jql: z.string().optional().describe("Raw JQL (scoped to org projects if no project clause)"),
    preset: z.enum(JIRA_JQL_PRESETS).optional().describe("Preset: open_bugs | blocked | open | done"),
    mode: z.enum(["count", "issues"]).optional(),
    maxResults: z.number().int().positive().max(50).optional()
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    jql: z.string().optional(),
    mode: z.enum(["count", "issues"]).optional(),
    projectKeys: z.array(z.string()).optional(),
    count: z.number().optional(),
    issues: z.array(
      z.object({
        key: z.string(),
        summary: z.string(),
        status: z.string(),
        issueType: z.string(),
        priority: z.string().optional(),
        assignee: z.string().optional()
      })
    ).optional(),
    nextPageToken: z.string().optional(),
    queriedAt: z.string().optional(),
    preset: z.string().optional(),
    error: z.string().optional()
  }),
  execute: async (inputData) => {
    if (!inputData.jql?.trim() && !inputData.preset) {
      return {
        ok: false,
        error: "Provide jql or a preset (open_bugs, blocked, open, done)"
      };
    }
    const result = await queryJiraJqlForOrganization({
      organizationId: inputData.organizationId,
      jql: inputData.jql,
      preset: inputData.preset,
      mode: inputData.mode ?? "issues",
      maxResults: inputData.maxResults
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      jql: result.jql,
      mode: result.mode,
      projectKeys: result.projectKeys,
      count: result.count,
      issues: result.issues,
      nextPageToken: result.nextPageToken,
      queriedAt: result.queriedAt,
      preset: result.preset
    };
  }
});

export { jiraJqlTool, jiraMyselfTool };
