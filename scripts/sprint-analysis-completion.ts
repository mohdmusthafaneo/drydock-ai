import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { resolveJiraAccessToken, listJiraFields } from "../src/lib/jira-api";
import { parseJiraMeta } from "../src/lib/jira-meta";

const CLOUD_ID = "212728dc-9989-4872-b3f6-b6ab9cad7d40";
const SPRINT_ID = 807;
const BOARD_ID = 1;
const PROJECT_KEY = "CX";
const JIRA_API = `https://api.atlassian.com/ex/jira/${CLOUD_ID}`;

async function jiraGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${JIRA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jira GET ${res.status} ${path}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

async function jiraPost<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${JIRA_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jira POST ${res.status} ${path}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

type StatusCategoryKey = "new" | "indeterminate" | "done" | string;

type IssueRow = {
  key: string;
  summary: string;
  status: string;
  statusCategory: StatusCategoryKey;
  statusCategoryName: string;
  issueType: string;
  priority?: string;
  assignee?: string;
  created: string;
  storyPoints?: number | null;
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function categorize(cat: StatusCategoryKey): "todo" | "inProgress" | "done" | "other" {
  if (cat === "new") return "todo";
  if (cat === "indeterminate") return "inProgress";
  if (cat === "done") return "done";
  return "other";
}

function isReviewOrTesting(status: string): boolean {
  return /review|test|qa|verify|validation|uat|staging/i.test(status);
}

function isTrulyDone(status: string, category: StatusCategoryKey): boolean {
  if (category !== "done") return false;
  return !isReviewOrTesting(status);
}

async function fetchAllSprintIssues(
  token: string,
  sprintId: number,
  searchFields: string[],
): Promise<IssueRow[]> {
  const issues: IssueRow[] = [];
  let nextPageToken: string | undefined;

  do {
    const data = await jiraPost<{
      issues?: Array<{
        key?: string;
        fields?: {
          summary?: string;
          status?: { name?: string; statusCategory?: { key?: string; name?: string } };
          issuetype?: { name?: string };
          priority?: { name?: string };
          assignee?: { displayName?: string };
          created?: string;
          [k: string]: unknown;
        };
      }>;
      nextPageToken?: string;
    }>(token, "/rest/api/3/search/jql", {
      jql: `sprint = ${sprintId} AND project = ${PROJECT_KEY}`,
      maxResults: 50,
      nextPageToken,
      fields: searchFields,
    });

    for (const issue of data.issues ?? []) {
      if (!issue.key) continue;
      const f = issue.fields ?? {};
      const spField = searchFields.find((fld) => fld.startsWith("customfield_"));
      const spVal = spField ? (f[spField] as number | null | undefined) : undefined;
      issues.push({
        key: issue.key,
        summary: (f.summary as string) ?? "",
        status: f.status?.name ?? "Unknown",
        statusCategory: f.status?.statusCategory?.key ?? "unknown",
        statusCategoryName: f.status?.statusCategory?.name ?? "Unknown",
        issueType: f.issuetype?.name ?? "Unknown",
        priority: f.priority?.name,
        assignee: f.assignee?.displayName,
        created: f.created ?? new Date().toISOString(),
        storyPoints: spVal ?? null,
      });
    }
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return issues;
}

async function main() {
  const now = new Date();

  const org = await prisma.organization.findFirst({ where: { slug: "connexus" } });
  if (!org) throw new Error("Organization connexus not found");

  const integration = await prisma.integration.findUnique({
    where: { organizationId_provider: { organizationId: org.id, provider: "JIRA" } },
  });
  if (!integration) throw new Error("JIRA integration not found for connexus");

  const meta = parseJiraMeta(integration.metadataJson);
  const { accessToken, cloudId } = await resolveJiraAccessToken(integration);

  // Sprint metadata — try agile API first, fall back to JQL-only context
  let sprintMeta: {
    id: number;
    name: string;
    state: string;
    startDate?: string;
    endDate?: string;
    goal?: string;
    source: string;
  };

  try {
    const sprint = await jiraGet<{
      id: number;
      name: string;
      state: string;
      startDate?: string;
      endDate?: string;
      goal?: string;
    }>(accessToken, `/rest/agile/1.0/sprint/${SPRINT_ID}`);
    sprintMeta = { ...sprint, source: "agile-api" };
  } catch {
    const boardSprints = await jiraGet<{
      values?: Array<{
        id: number;
        name: string;
        state: string;
        startDate?: string;
        endDate?: string;
        goal?: string;
      }>;
    }>(accessToken, `/rest/agile/1.0/board/${BOARD_ID}/sprint?state=active,closed&maxResults=100`);
    const found = boardSprints.values?.find((s) => s.id === SPRINT_ID);
    if (!found) {
      sprintMeta = {
        id: SPRINT_ID,
        name: "Sprint 35 (metadata unavailable)",
        state: "unknown",
        source: "fallback",
      };
    } else {
      sprintMeta = { ...found, source: "board-sprint-list" };
    }
  }

  const endDate = sprintMeta.endDate ? new Date(sprintMeta.endDate) : null;
  const startDate = sprintMeta.startDate ? new Date(sprintMeta.startDate) : null;
  const daysOverdue = endDate && now > endDate ? daysBetween(endDate, now) : 0;
  const sprintDurationDays =
    startDate && endDate ? daysBetween(startDate, endDate) : null;

  // Story point field
  let storyPointFieldId: string | undefined =
    meta.jiraSchemaSnapshot?.suggestions?.storyPointField?.id;
  let storyPointFieldName: string | undefined =
    meta.jiraSchemaSnapshot?.suggestions?.storyPointField?.name;

  if (!storyPointFieldId) {
    const fields = await listJiraFields(accessToken, cloudId);
    const sp = fields.find((f) => /story point/i.test(f.name));
    storyPointFieldId = sp?.id;
    storyPointFieldName = sp?.name;
  }

  const searchFields = [
    "summary",
    "status",
    "issuetype",
    "priority",
    "assignee",
    "created",
  ];
  if (storyPointFieldId) searchFields.push(storyPointFieldId);

  const issues = await fetchAllSprintIssues(accessToken, SPRINT_ID, searchFields);

  // Count cross-check
  const countData = await jiraPost<{ count?: number }>(
    accessToken,
    "/rest/api/3/search/approximate-count",
    { jql: `sprint = ${SPRINT_ID} AND project = ${PROJECT_KEY}` },
  );

  // Aggregations
  const byCategory = { todo: 0, inProgress: 0, done: 0, other: 0 };
  const byStatusName: Record<string, { count: number; category: string }> = {};
  const byIssueType: Record<string, number> = {};
  const priorityOpen: Record<string, number> = {};
  const sp = { committed: 0, completed: 0, remaining: 0, unestimated: 0 };

  const openIssues: Array<{
    key: string;
    status: string;
    priority: string;
    issueType: string;
    created: string;
    daysOpen: number;
    storyPoints: number | null;
  }> = [];

  const doneFunnel = {
    inReviewOrTesting: 0,
    trulyDone: 0,
    notDone: 0,
    reviewTestingStatuses: {} as Record<string, number>,
    doneStatuses: {} as Record<string, number>,
  };

  for (const issue of issues) {
    const cat = categorize(issue.statusCategory);
    byCategory[cat]++;
    byStatusName[issue.status] = byStatusName[issue.status] ?? { count: 0, category: issue.statusCategoryName };
    byStatusName[issue.status].count++;

    byIssueType[issue.issueType] = (byIssueType[issue.issueType] ?? 0) + 1;

    const pts = issue.storyPoints;
    if (pts == null) {
      sp.unestimated++;
    } else {
      sp.committed += pts;
      if (cat === "done") sp.completed += pts;
      else sp.remaining += pts;
    }

    if (cat !== "done") {
      const pri = issue.priority ?? "Unset";
      priorityOpen[pri] = (priorityOpen[pri] ?? 0) + 1;
      openIssues.push({
        key: issue.key,
        status: issue.status,
        priority: pri,
        issueType: issue.issueType,
        created: issue.created,
        daysOpen: daysBetween(new Date(issue.created), now),
        storyPoints: pts ?? null,
      });
    }

    if (cat === "done") {
      if (isReviewOrTesting(issue.status)) {
        doneFunnel.inReviewOrTesting++;
        doneFunnel.reviewTestingStatuses[issue.status] =
          (doneFunnel.reviewTestingStatuses[issue.status] ?? 0) + 1;
      } else if (isTrulyDone(issue.status, issue.statusCategory)) {
        doneFunnel.trulyDone++;
        doneFunnel.doneStatuses[issue.status] =
          (doneFunnel.doneStatuses[issue.status] ?? 0) + 1;
      } else {
        doneFunnel.trulyDone++;
        doneFunnel.doneStatuses[issue.status] =
          (doneFunnel.doneStatuses[issue.status] ?? 0) + 1;
      }
    } else {
      doneFunnel.notDone++;
      if (isReviewOrTesting(issue.status)) {
        doneFunnel.inReviewOrTesting++;
        doneFunnel.reviewTestingStatuses[issue.status] =
          (doneFunnel.reviewTestingStatuses[issue.status] ?? 0) + 1;
      }
    }
  }

  openIssues.sort((a, b) => b.daysOpen - a.daysOpen);

  const total = issues.length;
  const doneCount = byCategory.done;
  const issueCompletionPct = total > 0 ? Math.round((doneCount / total) * 1000) / 10 : 0;
  const spCompletionPct =
    sp.committed > 0 ? Math.round((sp.completed / sp.committed) * 1000) / 10 : null;
  const unestimatedPct = total > 0 ? Math.round((sp.unestimated / total) * 1000) / 10 : 0;
  const sprintEnded = endDate ? now > endDate : false;

  const report = {
    generatedAt: now.toISOString(),
    org: { slug: "connexus", name: org.name },
    jira: { cloudId, siteUrl: meta.siteUrl, project: PROJECT_KEY, boardId: BOARD_ID },
    sprint: {
      id: sprintMeta.id,
      name: sprintMeta.name,
      state: sprintMeta.state,
      goal: sprintMeta.goal ?? null,
      startDate: sprintMeta.startDate ?? null,
      endDate: sprintMeta.endDate ?? null,
      durationDays: sprintDurationDays,
      daysOverdue,
      sprintEnded,
      metadataSource: sprintMeta.source,
    },
    inventory: {
      totalIssues: total,
      approximateCountApi: countData.count ?? null,
    },
    statusBreakdown: {
      byCategory: {
        todo: { count: byCategory.todo, pct: total ? Math.round((byCategory.todo / total) * 1000) / 10 : 0 },
        inProgress: {
          count: byCategory.inProgress,
          pct: total ? Math.round((byCategory.inProgress / total) * 1000) / 10 : 0,
        },
        done: { count: byCategory.done, pct: total ? Math.round((byCategory.done / total) * 1000) / 10 : 0 },
        other: { count: byCategory.other, pct: total ? Math.round((byCategory.other / total) * 1000) / 10 : 0 },
      },
      notDone: byCategory.todo + byCategory.inProgress + byCategory.other,
      byStatusName: Object.entries(byStatusName)
        .map(([name, v]) => ({ status: name, category: v.category, count: v.count }))
        .sort((a, b) => b.count - a.count),
    },
    storyPoints: storyPointFieldId
      ? {
          field: { id: storyPointFieldId, name: storyPointFieldName ?? "Story Points" },
          committed: sp.committed,
          completed: sp.completed,
          remaining: sp.remaining,
          completionPct: spCompletionPct,
          unestimatedIssues: sp.unestimated,
          unestimatedPct,
        }
      : { available: false, unestimatedIssues: sp.unestimated, unestimatedPct },
    issueTypes: Object.entries(byIssueType)
      .map(([type, count]) => ({ type, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.count - a.count),
    openItems: {
      count: openIssues.length,
      priorityBreakdown: Object.entries(priorityOpen)
        .map(([priority, count]) => ({ priority, count }))
        .sort((a, b) => b.count - a.count),
      ageStats: openIssues.length
        ? {
            minDaysOpen: Math.min(...openIssues.map((i) => i.daysOpen)),
            maxDaysOpen: Math.max(...openIssues.map((i) => i.daysOpen)),
            avgDaysOpen: Math.round(
              openIssues.reduce((s, i) => s + i.daysOpen, 0) / openIssues.length,
            ),
            medianDaysOpen: openIssues[Math.floor(openIssues.length / 2)]?.daysOpen ?? 0,
          }
        : null,
      oldestOpen: openIssues.slice(0, 10).map((i) => ({
        key: i.key,
        status: i.status,
        priority: i.priority,
        issueType: i.issueType,
        daysOpen: i.daysOpen,
        created: i.created.split("T")[0],
        storyPoints: i.storyPoints,
      })),
    },
    doneFunnel: {
      inReviewOrTesting: doneFunnel.inReviewOrTesting,
      trulyDoneCategory: doneFunnel.trulyDone,
      notDone: doneFunnel.notDone,
      reviewTestingByStatus: doneFunnel.reviewTestingStatuses,
      doneByStatus: doneFunnel.doneStatuses,
    },
    commitmentRealism: {
      sprintEnded,
      daysOverdue,
      issuesShippedPct: issueCompletionPct,
      storyPointsShippedPct: spCompletionPct,
      issuesRemaining: byCategory.todo + byCategory.inProgress + byCategory.other,
      storyPointsRemaining: sp.remaining,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }, null, 2));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
