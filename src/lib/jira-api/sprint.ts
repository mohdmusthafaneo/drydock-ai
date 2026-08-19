import { jiraFetch } from "@/lib/jira-api/client";

export type JiraSprintIssue = {
  key: string;
  status: string;
  statusCategory: string;
  assignee?: string;
  created?: string;
  storyPoints?: number | null;
};

export type JiraSprintChangelogEntry = {
  from: string | null;
  to: string | null;
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
