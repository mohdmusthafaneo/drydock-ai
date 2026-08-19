import { jiraFetch } from "@/lib/jira-api/client";

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
