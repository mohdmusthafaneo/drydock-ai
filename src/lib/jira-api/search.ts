import { normalizeJiraDescription } from "@/lib/jira-adf";
import { jiraFetch } from "@/lib/jira-api/client";

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

export type JiraIssueWithDescription = {
  key: string;
  summary: string;
  description: string;
  assignee?: string;
};

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
