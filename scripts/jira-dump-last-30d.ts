/**
 * Dump Jira issues from the last 30 days to CSV.
 *
 * Token safety (Atlassian rotating refresh tokens):
 * - Never call refresh outside getJiraCredentialToken (advisory lock + persist).
 * - Obtain one access token up front; reuse it for every page.
 * - On 401 only, ask getJiraCredentialToken again (single-flight refresh).
 * - Never print tokens. Verify refresh token still stored after the dump.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { parseJiraMeta } from "../src/lib/jira-meta";
import { getJiraCredentialToken } from "../src/lib/integrations/jira-credentials";
import { jiraFetch, JiraApiError } from "../src/lib/jira-api/client";
import { normalizeJiraDescription } from "../src/lib/jira-adf";

const JIRA_API = "https://api.atlassian.com/ex/jira";
const PAGE_SIZE = 50;
const MAX_PAGES = 200;

const FIELDS = [
  "summary",
  "description",
  "status",
  "issuetype",
  "priority",
  "assignee",
  "reporter",
  "creator",
  "created",
  "updated",
  "resolutiondate",
  "resolution",
  "duedate",
  "labels",
  "components",
  "fixVersions",
  "versions",
  "project",
  "parent",
  "subtasks",
  "issuelinks",
  "environment",
  "comment",
  "watches",
  "votes",
  "timetracking",
  "timeoriginalestimate",
  "timeestimate",
  "timespent",
  "aggregatetimeoriginalestimate",
  "aggregatetimeestimate",
  "aggregatetimespent",
  "workratio",
  "security",
  "attachment",
  "sprint",
  "customfield_10016", // common story points
  "customfield_10020", // common sprint array
  "customfield_10014", // common epic link
  "customfield_10001",
  "customfield_10002",
  "customfield_10003",
  "customfield_10004",
  "customfield_10005",
  "customfield_10006",
  "customfield_10007",
  "customfield_10008",
  "customfield_10009",
  "customfield_10010",
  "customfield_10011",
  "customfield_10012",
  "customfield_10013",
  "customfield_10015",
  "customfield_10017",
  "customfield_10018",
  "customfield_10019",
  "customfield_10021",
  "customfield_10026",
  "customfield_10028",
  "customfield_10029",
  "customfield_10030",
  "customfield_10031",
  "customfield_10032",
  "customfield_10033",
  "customfield_10034",
  "customfield_10035",
  "customfield_10036",
] as const;

type Named = { name?: string; displayName?: string; accountId?: string; emailAddress?: string };
type Issue = {
  id?: string;
  key?: string;
  self?: string;
  fields?: Record<string, unknown>;
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function named(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const obj = value as Named;
  return obj.displayName || obj.name || obj.accountId || "";
}

function namedList(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((item) => named(item) || asString(item)).filter(Boolean).join("; ");
}

function sprintNames(fields: Record<string, unknown>): string {
  const candidates = [fields.sprint, fields.customfield_10020, fields.customfield_10016];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const names = candidate
        .map((item) => {
          if (!item || typeof item !== "object") return asString(item);
          const sprint = item as { name?: string };
          return sprint.name || asString(item);
        })
        .filter(Boolean);
      if (names.length) return names.join("; ");
    }
    if (candidate && typeof candidate === "object" && "name" in candidate) {
      return String((candidate as { name?: string }).name ?? "");
    }
  }
  return "";
}

function storyPoints(fields: Record<string, unknown>): string {
  for (const key of Object.keys(fields)) {
    if (!key.startsWith("customfield_")) continue;
    const value = fields[key];
    if (typeof value === "number") return String(value);
  }
  return "";
}

function commentSummary(fields: Record<string, unknown>): {
  count: string;
  latest: string;
  bodies: string;
} {
  const comment = fields.comment as
    | {
        total?: number;
        comments?: Array<{
          created?: string;
          author?: Named;
          body?: unknown;
        }>;
      }
    | undefined;
  if (!comment) return { count: "", latest: "", bodies: "" };
  const comments = comment.comments ?? [];
  const latest = comments[comments.length - 1];
  const bodies = comments
    .map((entry) => {
      const author = named(entry.author);
      const body = normalizeJiraDescription(entry.body).replace(/\s+/g, " ").trim();
      return `[${entry.created ?? ""} ${author}] ${body}`;
    })
    .join(" | ");
  return {
    count: String(comment.total ?? comments.length),
    latest: latest
      ? `${latest.created ?? ""} ${named(latest.author)}: ${normalizeJiraDescription(latest.body)
          .replace(/\s+/g, " ")
          .trim()}`
      : "",
    bodies,
  };
}

function issueLinks(fields: Record<string, unknown>): string {
  const links = fields.issuelinks;
  if (!Array.isArray(links)) return "";
  return links
    .map((link) => {
      if (!link || typeof link !== "object") return "";
      const row = link as {
        type?: { name?: string; inward?: string; outward?: string };
        inwardIssue?: { key?: string };
        outwardIssue?: { key?: string };
      };
      if (row.inwardIssue?.key) {
        return `${row.type?.inward || row.type?.name || "inward"} ${row.inwardIssue.key}`;
      }
      if (row.outwardIssue?.key) {
        return `${row.type?.outward || row.type?.name || "outward"} ${row.outwardIssue.key}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("; ");
}

function attachments(fields: Record<string, unknown>): string {
  const list = fields.attachment;
  if (!Array.isArray(list)) return "";
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const file = item as { filename?: string; size?: number; mimeType?: string };
      return [file.filename, file.mimeType, file.size != null ? `${file.size}b` : ""]
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean)
    .join("; ");
}

function flattenIssue(issue: Issue): Record<string, string> {
  const fields = issue.fields ?? {};
  const status = fields.status as { name?: string; statusCategory?: { name?: string; key?: string } } | undefined;
  const project = fields.project as { key?: string; name?: string } | undefined;
  const parent = fields.parent as { key?: string; fields?: { summary?: string } } | undefined;
  const comments = commentSummary(fields);
  const watches = fields.watches as { watchCount?: number } | undefined;
  const votes = fields.votes as { votes?: number } | undefined;
  const resolution = fields.resolution as { name?: string } | undefined;
  const subtasks = Array.isArray(fields.subtasks)
    ? fields.subtasks
        .map((item) => (item && typeof item === "object" ? (item as { key?: string }).key : ""))
        .filter(Boolean)
        .join("; ")
    : "";

  return {
    id: asString(issue.id),
    key: asString(issue.key),
    url: "",
    projectKey: project?.key ?? "",
    projectName: project?.name ?? "",
    summary: asString(fields.summary),
    description: normalizeJiraDescription(fields.description).replace(/\r\n/g, "\n"),
    issueType: named(fields.issuetype),
    status: status?.name ?? "",
    statusCategory: status?.statusCategory?.name ?? status?.statusCategory?.key ?? "",
    priority: named(fields.priority),
    resolution: resolution?.name ?? "",
    assignee: named(fields.assignee),
    assigneeAccountId: (fields.assignee as Named | undefined)?.accountId ?? "",
    reporter: named(fields.reporter),
    creator: named(fields.creator),
    created: asString(fields.created),
    updated: asString(fields.updated),
    resolutiondate: asString(fields.resolutiondate),
    duedate: asString(fields.duedate),
    labels: Array.isArray(fields.labels) ? fields.labels.map(asString).join("; ") : "",
    components: namedList(fields.components),
    fixVersions: namedList(fields.fixVersions),
    affectsVersions: namedList(fields.versions),
    parentKey: parent?.key ?? "",
    parentSummary: parent?.fields?.summary ?? "",
    subtasks,
    issueLinks: issueLinks(fields),
    environment: normalizeJiraDescription(fields.environment),
    sprint: sprintNames(fields),
    storyPoints: storyPoints(fields),
    commentCount: comments.count,
    latestComment: comments.latest,
    comments: comments.bodies,
    watchCount: watches?.watchCount != null ? String(watches.watchCount) : "",
    votes: votes?.votes != null ? String(votes.votes) : "",
    timeOriginalEstimate: asString(fields.timeoriginalestimate),
    timeEstimate: asString(fields.timeestimate),
    timeSpent: asString(fields.timespent),
    aggregateTimeOriginalEstimate: asString(fields.aggregatetimeoriginalestimate),
    aggregateTimeEstimate: asString(fields.aggregatetimeestimate),
    aggregateTimeSpent: asString(fields.aggregatetimespent),
    workratio: asString(fields.workratio),
    security: named(fields.security),
    attachments: attachments(fields),
    issueSelf: asString(issue.self),
  };
}

async function searchPage(
  accessToken: string,
  cloudId: string,
  jql: string,
  nextPageToken?: string,
): Promise<{ issues: Issue[]; nextPageToken?: string }> {
  return jiraFetch<{ issues?: Issue[]; nextPageToken?: string }>(
    accessToken,
    cloudId,
    "/rest/api/3/search/jql",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jql,
        maxResults: PAGE_SIZE,
        nextPageToken,
        fields: [...FIELDS],
      }),
    },
  ).then((data) => ({
    issues: data.issues ?? [],
    nextPageToken: data.nextPageToken,
  }));
}

async function main() {
  const slug = process.argv[2] || "tpt-platform";
  const outDir = join(homedir(), "tmp-drydock");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `jira-issues-last-30d-${slug}.csv`);

  const integration = await prisma.integration.findFirst({
    where: { provider: "JIRA", organization: { slug } },
    include: { organization: { select: { id: true, slug: true, name: true } } },
  });

  if (!integration) {
    throw new Error(`No Jira integration row for org '${slug}'`);
  }

  const before = parseJiraMeta(integration.metadataJson);
  console.log(
    JSON.stringify(
      {
        org: integration.organization.slug,
        orgName: integration.organization.name,
        status: integration.status,
        siteUrl: before.siteUrl ?? null,
        siteName: before.siteName ?? null,
        displayName: before.displayName ?? null,
        hasAccessToken: Boolean(before.accessTokenEnc),
        hasRefreshToken: Boolean(before.refreshTokenEnc),
        connectionStatus: before.connectionStatus ?? null,
        projectKeys: before.projectKeys ?? [],
      },
      null,
      2,
    ),
  );

  if (integration.status !== "CONNECTED" || !before.cloudId) {
    throw new Error(
      `Jira is not connected for '${slug}'. Connect via /integrations or a share link first.`,
    );
  }

  let accessToken = await getJiraCredentialToken(integration.organizationId);
  const afterAuth = await prisma.integration.findUniqueOrThrow({ where: { id: integration.id } });
  const afterAuthMeta = parseJiraMeta(afterAuth.metadataJson);
  console.log(
    JSON.stringify(
      {
        tokenReady: true,
        refreshTokenStillStored: Boolean(afterAuthMeta.refreshTokenEnc),
        accessTokenStillStored: Boolean(afterAuthMeta.accessTokenEnc),
      },
      null,
      2,
    ),
  );

  const myself = await jiraFetch<{ accountId?: string; displayName?: string; emailAddress?: string }>(
    accessToken,
    before.cloudId,
    "/rest/api/3/myself",
  );
  console.log(
    JSON.stringify(
      {
        apiUser: {
          accountId: myself.accountId ?? null,
          displayName: myself.displayName ?? null,
          emailAddress: myself.emailAddress ?? null,
        },
      },
      null,
      2,
    ),
  );

  const jql = "(created >= -30d OR updated >= -30d) ORDER BY updated DESC";
  const rows: Record<string, string>[] = [];
  let nextPageToken: string | undefined;
  let refreshedOn401 = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    let result: { issues: Issue[]; nextPageToken?: string };
    try {
      result = await searchPage(accessToken, before.cloudId, jql, nextPageToken);
    } catch (error) {
      if (!(error instanceof JiraApiError) || error.status !== 401 || refreshedOn401) {
        throw error;
      }
      console.log(JSON.stringify({ note: "access token rejected; refreshing once under lock" }));
      accessToken = await getJiraCredentialToken(integration.organizationId);
      refreshedOn401 = true;
      result = await searchPage(accessToken, before.cloudId, jql, nextPageToken);
    }

    for (const issue of result.issues) {
      const flat = flattenIssue(issue);
      if (before.siteUrl && flat.key) {
        flat.url = `${before.siteUrl.replace(/\/$/, "")}/browse/${flat.key}`;
      }
      rows.push(flat);
    }

    console.log(
      JSON.stringify({
        page: page + 1,
        fetched: result.issues.length,
        totalSoFar: rows.length,
        hasMore: Boolean(result.nextPageToken),
      }),
    );

    if (!result.nextPageToken || result.issues.length === 0) break;
    nextPageToken = result.nextPageToken;
  }

  if (rows.length === 0) {
    writeFileSync(outPath, "key,summary\n", "utf8");
  } else {
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
    ];
    writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  }

  const finalRow = await prisma.integration.findUniqueOrThrow({ where: { id: integration.id } });
  const finalMeta = parseJiraMeta(finalRow.metadataJson);

  console.log(
    JSON.stringify(
      {
        output: outPath,
        issueCount: rows.length,
        jql,
        status: finalRow.status,
        hasAccessToken: Boolean(finalMeta.accessTokenEnc),
        hasRefreshToken: Boolean(finalMeta.refreshTokenEnc),
        connectionStatus: finalMeta.connectionStatus ?? null,
        siteUrl: finalMeta.siteUrl ?? null,
      },
      null,
      2,
    ),
  );

  if (!finalMeta.refreshTokenEnc || !finalMeta.accessTokenEnc || finalRow.status !== "CONNECTED") {
    throw new Error("Safety check failed: Jira tokens or connection status missing after dump");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
