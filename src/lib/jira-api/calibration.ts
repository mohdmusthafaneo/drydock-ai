import { jiraFetch } from "@/lib/jira-api/client";

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
