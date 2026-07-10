import { decryptToken, encryptToken } from "@/lib/token-crypto";
import {
  fetchJiraMyself,
  refreshJiraAccessToken,
  type AtlassianAccessibleResource,
} from "@/lib/jira-oauth";
import {
  mergeJiraMeta,
  parseJiraMeta,
  type JiraIntegrationMeta,
  type JiraSiteSummary,
} from "@/lib/jira-meta";
import type { Integration } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { httpFetch, HttpResponseError } from "@/lib/http/client";
import {
  isJiraReconnectError,
  JIRA_RECONNECT_MESSAGE,
} from "@/lib/jira-errors";
import { normalizeJiraDescription } from "@/lib/jira-adf";

export class JiraApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export { JIRA_RECONNECT_MESSAGE, isJiraReconnectError, isJiraReconnectMessage } from "@/lib/jira-errors";

function jiraErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isJiraScopeError(err: unknown): boolean {
  if (!(err instanceof JiraApiError) || err.status !== 401) return false;
  const lower = jiraErrorMessage(err).toLowerCase();
  return lower.includes("scope") || lower.includes("unauthorized");
}

export function formatJiraSyncError(err: unknown): string {
  if (err instanceof JiraApiError && err.status === 410) {
    return "Jira search API was updated by Atlassian. Restart the dev server and sync again.";
  }
  if (isJiraReconnectError(err)) {
    return JIRA_RECONNECT_MESSAGE;
  }
  if (isJiraScopeError(err)) {
    return (
      "Jira OAuth scopes are insufficient for sync. In the Atlassian developer console, enable " +
      "read:jira-work, read:project:jira, read:board-scope:jira-software, and read:sprint:jira-software " +
      "for your app, then disconnect and reconnect Jira here."
    );
  }
  if (err instanceof JiraApiError) {
    return `Jira API error (${err.status}): ${parseJiraErrorBody(err.message)}`;
  }
  return err instanceof Error ? err.message : "Sync failed";
}

/** Persist sync/auth failure and mark connection unhealthy when OAuth must be renewed. */
export async function recordJiraIntegrationFailure(
  organizationId: string,
  err: unknown,
): Promise<string> {
  const message = formatJiraSyncError(err);
  const markConnectionError = isJiraReconnectError(err);

  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "JIRA" },
    },
  });
  if (!integration) return message;

  await prisma.integration
    .update({
      where: { id: integration.id },
      data: {
        lastError: message,
        ...(markConnectionError
          ? {
              metadataJson: applyJiraMetaPatch(integration, {
                connectionStatus: "error",
                lastError: message,
                lastConnectionCheckAt: new Date().toISOString(),
              }),
            }
          : {}),
      },
    })
    .catch(() => undefined);

  return message;
}

function parseJiraErrorBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    if (parsed.message) return parsed.message;
  } catch {
    // not JSON
  }
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}

export function getJiraAccessToken(integration: Integration): string | null {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.accessTokenEnc) return null;
  try {
    return decryptToken(meta.accessTokenEnc);
  } catch {
    return null;
  }
}

export function getJiraRefreshToken(integration: Integration): string | null {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.refreshTokenEnc) return null;
  try {
    return decryptToken(meta.refreshTokenEnc);
  } catch {
    return null;
  }
}

function siteFromResource(resource: AtlassianAccessibleResource): JiraSiteSummary {
  return {
    cloudId: resource.id,
    siteUrl: resource.url.replace(/\/$/, ""),
    siteName: resource.name,
  };
}

export function buildJiraOAuthMeta(input: {
  existing?: Partial<JiraIntegrationMeta>;
  accessToken: string;
  refreshToken?: string;
  scope: string;
  userId: string;
  resources: AtlassianAccessibleResource[];
  myself?: { accountId: string; displayName: string };
}): JiraIntegrationMeta {
  const availableSites = input.resources.map(siteFromResource);
  const primary = availableSites[0];
  if (!primary) {
    throw new Error("No accessible Jira Cloud sites for this account");
  }

  return {
    ...input.existing,
    mode: "oauth-readonly",
    cloudId: primary.cloudId,
    siteUrl: primary.siteUrl,
    siteName: primary.siteName,
    accountId: input.myself?.accountId,
    displayName: input.myself?.displayName,
    scopes: input.scope,
    accessTokenEnc: encryptToken(input.accessToken),
    refreshTokenEnc: input.refreshToken ? encryptToken(input.refreshToken) : undefined,
    connectedBy: input.userId,
    availableSites: availableSites.length > 1 ? availableSites : undefined,
    lastConnectionCheckAt: new Date().toISOString(),
    connectionStatus: "ok",
    lastError: undefined,
  };
}

/** Verify the stored connection by calling Jira /myself (PR1 probe). */
export async function probeJiraConnection(integration: Integration): Promise<{
  ok: boolean;
  error?: string;
  metaPatch?: Partial<JiraIntegrationMeta>;
}> {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.cloudId) {
    return { ok: false, error: "Missing cloudId in integration metadata" };
  }

  let accessToken = getJiraAccessToken(integration);
  if (!accessToken) {
    return { ok: false, error: "Missing or invalid access token" };
  }

  try {
    await fetchJiraMyself(accessToken, meta.cloudId);
    return {
      ok: true,
      metaPatch: {
        lastConnectionCheckAt: new Date().toISOString(),
        connectionStatus: "ok",
        lastError: undefined,
      },
    };
  } catch (err) {
    if (err instanceof JiraApiError && err.status === 401) {
      const refreshToken = getJiraRefreshToken(integration);
      if (refreshToken) {
        try {
          const refreshed = await refreshJiraAccessToken(refreshToken);
          accessToken = refreshed.accessToken;
          await fetchJiraMyself(accessToken, meta.cloudId);
          return {
            ok: true,
            metaPatch: {
              accessTokenEnc: encryptToken(refreshed.accessToken),
              refreshTokenEnc: refreshed.refreshToken
                ? encryptToken(refreshed.refreshToken)
                : meta.refreshTokenEnc,
              lastConnectionCheckAt: new Date().toISOString(),
              connectionStatus: "ok",
              lastError: undefined,
            },
          };
        } catch (refreshErr) {
          const message = formatJiraSyncError(refreshErr);
          return {
            ok: false,
            error: message,
            metaPatch: {
              lastConnectionCheckAt: new Date().toISOString(),
              connectionStatus: "error",
              lastError: message,
            },
          };
        }
      }
    }

    const message = err instanceof Error ? err.message : "Connection probe failed";
    return {
      ok: false,
      error: message,
      metaPatch: {
        lastConnectionCheckAt: new Date().toISOString(),
        connectionStatus: "error",
        lastError: message,
      },
    };
  }
}

export function applyJiraMetaPatch(
  integration: Integration,
  patch: Partial<JiraIntegrationMeta>,
): string {
  return mergeJiraMeta(parseJiraMeta(integration.metadataJson), patch);
}


const JIRA_API = "https://api.atlassian.com/ex/jira";

async function jiraFetch<T>(
  accessToken: string,
  cloudId: string,
  path: string,
  init?: RequestInit,
  organizationId?: string,
): Promise<T> {
  const url = path.startsWith("http") ? path : `${JIRA_API}/${cloudId}${path}`;
  let res: Response;
  try {
    res = await httpFetch({
      url,
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      body: init?.body ?? undefined,
      scope: { provider: "jira", organizationId },
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

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export type JiraProjectSummary = {
  id: string;
  key: string;
  name: string;
};

export type JiraVersionSummary = {
  id: string;
  name: string;
  released: boolean;
  releaseDate?: string;
};

export type JiraBoardSummary = {
  id: number;
  name: string;
  type: string;
};

export type JiraSprintSummary = {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
};

/** Resolve access token, refreshing and returning metadata patch on 401. */
export async function resolveJiraAccessToken(integration: Integration): Promise<{
  accessToken: string;
  cloudId: string;
  metaPatch?: Partial<JiraIntegrationMeta>;
}> {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.cloudId) {
    throw new Error("Missing cloudId in integration metadata");
  }

  let accessToken = getJiraAccessToken(integration);
  if (!accessToken) {
    throw new Error("Jira token missing — reconnect via OAuth");
  }

  try {
    await jiraFetch(accessToken, meta.cloudId, "/rest/api/3/myself", undefined, integration.organizationId);
    return { accessToken, cloudId: meta.cloudId };
  } catch (err) {
    if (!(err instanceof JiraApiError) || err.status !== 401) throw err;

    const refreshToken = getJiraRefreshToken(integration);
    if (!refreshToken) {
      throw new Error("Jira access token expired — reconnect via OAuth");
    }

    const refreshed = await refreshJiraAccessToken(refreshToken);
    await jiraFetch(
      refreshed.accessToken,
      meta.cloudId,
      "/rest/api/3/myself",
      undefined,
      integration.organizationId,
    );
    return {
      accessToken: refreshed.accessToken,
      cloudId: meta.cloudId,
      metaPatch: {
        accessTokenEnc: encryptToken(refreshed.accessToken),
        refreshTokenEnc: refreshed.refreshToken
          ? encryptToken(refreshed.refreshToken)
          : meta.refreshTokenEnc,
      },
    };
  }
}

export async function listJiraProjects(
  accessToken: string,
  cloudId: string,
  maxResults = 50,
): Promise<JiraProjectSummary[]> {
  const data = await jiraFetch<{
    values?: Array<{ id: string; key: string; name: string }>;
  }>(
    accessToken,
    cloudId,
    `/rest/api/3/project/search?maxResults=${maxResults}&orderBy=lastIssueUpdatedTime`,
  );
  return (data.values ?? []).map((p) => ({ id: p.id, key: p.key, name: p.name }));
}

export async function getJiraProject(
  accessToken: string,
  cloudId: string,
  projectKey: string,
): Promise<JiraProjectSummary> {
  const p = await jiraFetch<{ id: string; key: string; name: string }>(
    accessToken,
    cloudId,
    `/rest/api/3/project/${encodeURIComponent(projectKey)}`,
  );
  return { id: p.id, key: p.key, name: p.name };
}

export async function listProjectVersions(
  accessToken: string,
  cloudId: string,
  projectKey: string,
): Promise<JiraVersionSummary[]> {
  const versions = await jiraFetch<
    Array<{ id: string; name: string; released: boolean; releaseDate?: string }>
  >(accessToken, cloudId, `/rest/api/3/project/${encodeURIComponent(projectKey)}/versions`);
  return versions.map((v) => ({
    id: v.id,
    name: v.name,
    released: v.released,
    releaseDate: v.releaseDate,
  }));
}

export async function listBoardsForProject(
  accessToken: string,
  cloudId: string,
  projectKey: string,
): Promise<JiraBoardSummary[]> {
  const data = await jiraFetch<{ values?: JiraBoardSummary[] }>(
    accessToken,
    cloudId,
    `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=50`,
  );
  return data.values ?? [];
}

export async function listBoardSprints(
  accessToken: string,
  cloudId: string,
  boardId: number,
  states = "active,future",
): Promise<JiraSprintSummary[]> {
  const data = await jiraFetch<{ values?: JiraSprintSummary[] }>(
    accessToken,
    cloudId,
    `/rest/agile/1.0/board/${boardId}/sprint?state=${states}&maxResults=50`,
  );
  return data.values ?? [];
}

export async function countIssuesByJql(
  accessToken: string,
  cloudId: string,
  jql: string,
): Promise<number> {
  const data = await jiraFetch<{ count?: number }>(
    accessToken,
    cloudId,
    "/rest/api/3/search/approximate-count",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jql }),
    },
  );
  return data.count ?? 0;
}

export type JiraIssueSummary = {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  priority?: string;
  assignee?: string;
};

export type JiraIssueSearchResult = {
  issues: JiraIssueSummary[];
  nextPageToken?: string;
};

export type JiraCalibrationIssueRaw = {
  key: string;
  status: string;
  issueType: string;
  created?: string;
  resolutionDate?: string;
  labels: string[];
  fixVersions: string[];
  assignee?: string;
  dueDate?: string;
  transitions: Array<{ from?: string; to: string; at: string }>;
};

export type JiraCalibrationIssueSearchResult = {
  issues: JiraCalibrationIssueRaw[];
  nextPageToken?: string;
};

const CALIBRATION_SEARCH_FIELDS = [
  "status",
  "issuetype",
  "created",
  "resolutiondate",
  "labels",
  "fixVersions",
  "assignee",
  "duedate",
] as const;

function parseChangelogTransitions(changelog?: {
  histories?: Array<{
    created?: string;
    items?: Array<{ field?: string; fromString?: string; toString?: string }>;
  }>;
}): Array<{ from?: string; to: string; at: string }> {
  const transitions: Array<{ from?: string; to: string; at: string }> = [];
  for (const history of changelog?.histories ?? []) {
    const at = history.created ?? new Date().toISOString();
    for (const item of history.items ?? []) {
      if (item.field?.toLowerCase() !== "status") continue;
      if (!item.toString) continue;
      transitions.push({
        from: item.fromString || undefined,
        to: item.toString,
        at,
      });
    }
  }
  return transitions;
}

function parseCalibrationIssue(issue: {
  key?: string;
  changelog?: {
    histories?: Array<{
      created?: string;
      items?: Array<{ field?: string; fromString?: string; toString?: string }>;
    }>;
  };
  fields?: {
    status?: { name?: string };
    issuetype?: { name?: string };
    created?: string;
    resolutiondate?: string;
    labels?: string[];
    fixVersions?: Array<{ name?: string }>;
    assignee?: { displayName?: string };
    duedate?: string;
  };
}): JiraCalibrationIssueRaw | null {
  if (!issue.key) return null;
  return {
    key: issue.key,
    status: issue.fields?.status?.name ?? "Unknown",
    issueType: issue.fields?.issuetype?.name ?? "Unknown",
    created: issue.fields?.created,
    resolutionDate: issue.fields?.resolutiondate,
    labels: issue.fields?.labels ?? [],
    fixVersions: (issue.fields?.fixVersions ?? [])
      .map((v) => v.name)
      .filter((name): name is string => Boolean(name)),
    assignee: issue.fields?.assignee?.displayName,
    dueDate: issue.fields?.duedate,
    transitions: parseChangelogTransitions(issue.changelog),
  };
}

/** Paginated JQL search with changelog expand for calibration sampling. */
export async function searchCalibrationIssuesByJql(
  accessToken: string,
  cloudId: string,
  input: {
    jql: string;
    maxResults?: number;
    nextPageToken?: string;
    fields?: string[];
  },
): Promise<JiraCalibrationIssueSearchResult> {
  const data = await jiraFetch<{
    issues?: Array<{
      key?: string;
      changelog?: {
        histories?: Array<{
          created?: string;
          items?: Array<{ field?: string; fromString?: string; toString?: string }>;
        }>;
      };
      fields?: {
        status?: { name?: string };
        issuetype?: { name?: string };
        created?: string;
        resolutiondate?: string;
        labels?: string[];
        fixVersions?: Array<{ name?: string }>;
        assignee?: { displayName?: string };
        duedate?: string;
      };
    }>;
    nextPageToken?: string;
  }>(accessToken, cloudId, "/rest/api/3/search/jql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jql: input.jql,
      maxResults: Math.min(input.maxResults ?? 50, 50),
      nextPageToken: input.nextPageToken,
      fields: input.fields ?? [...CALIBRATION_SEARCH_FIELDS],
      expand: "changelog",
    }),
  });

  return {
    issues: (data.issues ?? [])
      .map(parseCalibrationIssue)
      .filter((issue): issue is JiraCalibrationIssueRaw => issue !== null),
    nextPageToken: data.nextPageToken,
  };
}

const DEFAULT_JIRA_SEARCH_FIELDS = [
  "summary",
  "status",
  "issuetype",
  "priority",
  "assignee",
] as const;

function parseJiraIssueSummary(issue: {
  key?: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    issuetype?: { name?: string };
    priority?: { name?: string };
    assignee?: { displayName?: string };
  };
}): JiraIssueSummary | null {
  if (!issue.key) return null;
  return {
    key: issue.key,
    summary: issue.fields?.summary ?? "",
    status: issue.fields?.status?.name ?? "Unknown",
    issueType: issue.fields?.issuetype?.name ?? "Unknown",
    priority: issue.fields?.priority?.name,
    assignee: issue.fields?.assignee?.displayName,
  };
}

/** Live JQL search via Atlassian enhanced search API (read-only). */
export async function searchIssuesByJql(
  accessToken: string,
  cloudId: string,
  input: {
    jql: string;
    maxResults?: number;
    nextPageToken?: string;
    fields?: string[];
  },
): Promise<JiraIssueSearchResult> {
  const data = await jiraFetch<{
    issues?: Array<{
      key?: string;
      fields?: {
        summary?: string;
        status?: { name?: string };
        issuetype?: { name?: string };
        priority?: { name?: string };
        assignee?: { displayName?: string };
      };
    }>;
    nextPageToken?: string;
  }>(accessToken, cloudId, "/rest/api/3/search/jql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jql: input.jql,
      maxResults: Math.min(input.maxResults ?? 20, 50),
      nextPageToken: input.nextPageToken,
      fields: input.fields ?? [...DEFAULT_JIRA_SEARCH_FIELDS],
    }),
  });

  return {
    issues: (data.issues ?? [])
      .map(parseJiraIssueSummary)
      .filter((issue): issue is JiraIssueSummary => issue !== null),
    nextPageToken: data.nextPageToken,
  };
}

export type JiraSprintIssue = {
  key: string;
  status: string;
  statusCategory: string;
  assignee?: string;
  created?: string;
  storyPoints?: number | null;
};

function parseSprintIssue(
  issue: {
    key?: string;
    fields?: {
      status?: { name?: string; statusCategory?: { key?: string } };
      assignee?: { displayName?: string };
      created?: string;
      [k: string]: unknown;
    };
  },
  storyPointFieldId?: string,
): JiraSprintIssue | null {
  if (!issue.key) return null;
  const fields = issue.fields ?? {};
  const spRaw = storyPointFieldId ? fields[storyPointFieldId] : undefined;
  const storyPoints =
    typeof spRaw === "number" ? spRaw : spRaw == null ? null : Number(spRaw);

  return {
    key: issue.key,
    status: fields.status?.name ?? "Unknown",
    statusCategory: fields.status?.statusCategory?.key ?? "unknown",
    assignee: fields.assignee?.displayName,
    created: fields.created,
    storyPoints: Number.isFinite(storyPoints) ? storyPoints : null,
  };
}

/** Paginated fetch of all issues in a sprint for metric aggregation. */
export async function fetchAllSprintIssues(
  accessToken: string,
  cloudId: string,
  sprintId: number,
  storyPointFieldId?: string,
): Promise<JiraSprintIssue[]> {
  const fields = ["status", "assignee", "created"];
  if (storyPointFieldId) fields.push(storyPointFieldId);

  const issues: JiraSprintIssue[] = [];
  let nextPageToken: string | undefined;

  do {
    const data = await jiraFetch<{
      issues?: Array<{
        key?: string;
        fields?: {
          status?: { name?: string; statusCategory?: { key?: string } };
          assignee?: { displayName?: string };
          created?: string;
          [k: string]: unknown;
        };
      }>;
      nextPageToken?: string;
    }>(accessToken, cloudId, "/rest/api/3/search/jql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jql: `sprint = ${sprintId}`,
        maxResults: 50,
        nextPageToken,
        fields,
      }),
    });

    for (const issue of data.issues ?? []) {
      const row = parseSprintIssue(issue, storyPointFieldId);
      if (row) issues.push(row);
    }
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return issues;
}

export type JiraSprintChangelogEntry = {
  from: string | null;
  to: string | null;
};

/** Sprint field changes from issue changelog (for spillover detection). */
export async function fetchIssueSprintChangelog(
  accessToken: string,
  cloudId: string,
  issueKey: string,
): Promise<JiraSprintChangelogEntry[]> {
  const changes: JiraSprintChangelogEntry[] = [];
  let startAt = 0;
  const maxPerPage = 100;

  while (true) {
    const data = await jiraFetch<{
      values?: Array<{
        items?: Array<{ field?: string; fromString?: string; toString?: string }>;
      }>;
      total?: number;
      maxResults?: number;
    }>(
      accessToken,
      cloudId,
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=${maxPerPage}`,
    );

    for (const history of data.values ?? []) {
      for (const item of history.items ?? []) {
        if (item.field?.toLowerCase() !== "sprint") continue;
        changes.push({
          from: item.fromString ?? null,
          to: item.toString ?? null,
        });
      }
    }

    const total = data.total ?? 0;
    startAt += data.maxResults ?? maxPerPage;
    if (startAt >= total) break;
  }

  return changes;
}

export type JiraIssueWithDescription = {
  key: string;
  summary: string;
  description: string;
  assignee?: string;
};

/** Fetch issue summary + description for completion scoring. */
export async function searchIssuesWithDescriptions(
  accessToken: string,
  cloudId: string,
  keys: string[],
): Promise<JiraIssueWithDescription[]> {
  const uniqueKeys = [...new Set(keys)].slice(0, 20);
  if (uniqueKeys.length === 0) return [];

  const quoted = uniqueKeys.map((k) => `"${k}"`).join(", ");
  const jql = `key in (${quoted})`;

  const data = await jiraFetch<{
    issues?: Array<{
      key?: string;
      fields?: {
        summary?: string;
        description?: unknown;
        assignee?: { displayName?: string };
      };
    }>;
  }>(accessToken, cloudId, "/rest/api/3/search/jql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jql,
      maxResults: uniqueKeys.length,
      fields: ["summary", "description", "assignee"],
    }),
  });

  return (data.issues ?? [])
    .filter((issue): issue is { key: string; fields?: { summary?: string; description?: unknown; assignee?: { displayName?: string } } } =>
      Boolean(issue.key),
    )
    .map((issue) => ({
      key: issue.key,
      summary: issue.fields?.summary ?? "",
      description: normalizeJiraDescription(issue.fields?.description),
      assignee: issue.fields?.assignee?.displayName,
    }));
}

export type JiraFieldSummary = {
  id: string;
  name: string;
  custom: boolean;
  schema?: { type: string; custom?: string };
};

export type JiraIssueTypeSummary = {
  id: string;
  name: string;
  subtask: boolean;
  scope?: { type?: string; project?: { key?: string } };
};

export type JiraStatusSummary = {
  id: string;
  name: string;
  statusCategory: { key: string; name: string };
};

export async function listJiraFields(
  accessToken: string,
  cloudId: string,
): Promise<JiraFieldSummary[]> {
  const fields = await jiraFetch<
    Array<{ id: string; name: string; custom: boolean; schema?: { type: string; custom?: string } }>
  >(accessToken, cloudId, "/rest/api/3/field");
  return fields.map((f) => ({
    id: f.id,
    name: f.name,
    custom: f.custom,
    schema: f.schema,
  }));
}

export async function listJiraIssueTypes(
  accessToken: string,
  cloudId: string,
): Promise<JiraIssueTypeSummary[]> {
  const types = await jiraFetch<
    Array<{
      id: string;
      name: string;
      subtask: boolean;
      scope?: { type?: string; project?: { key?: string } };
    }>
  >(accessToken, cloudId, "/rest/api/3/issuetype");
  return types.map((t) => ({
    id: t.id,
    name: t.name,
    subtask: t.subtask,
    scope: t.scope,
  }));
}

export async function listProjectStatuses(
  accessToken: string,
  cloudId: string,
  projectKey: string,
): Promise<
  Array<{
    name: string;
    statuses: JiraStatusSummary[];
  }>
> {
  return jiraFetch(accessToken, cloudId, `/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`);
}
