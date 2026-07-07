import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { resolveJiraAccessToken, listJiraFields } from "../src/lib/jira-api";
import { parseJiraMeta } from "../src/lib/jira-meta";

const CLOUD_ID = "212728dc-9989-4872-b3f6-b6ab9cad7d40";
const JIRA_API = `https://api.atlassian.com/ex/jira/${CLOUD_ID}`;

async function jiraGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${JIRA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jira ${res.status} ${path}: ${text.slice(0, 300)}`);
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
    throw new Error(`Jira ${res.status} ${path}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

type StatusCategory = "new" | "indeterminate" | "done" | string;

function categorize(cat: StatusCategory): "todo" | "inProgress" | "done" | "other" {
  if (cat === "new") return "todo";
  if (cat === "indeterminate") return "inProgress";
  if (cat === "done") return "done";
  return "other";
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "connexus" } });
  if (!org) throw new Error("Organization connexus not found");

  const integration = await prisma.integration.findUnique({
    where: { organizationId_provider: { organizationId: org.id, provider: "JIRA" } },
  });
  if (!integration) throw new Error("JIRA integration not found for connexus");

  const meta = parseJiraMeta(integration.metadataJson);
  const { accessToken, cloudId } = await resolveJiraAccessToken(integration);

  const report: Record<string, unknown> = {
    org: org.name,
    siteUrl: meta.siteUrl,
    cloudId,
    tokenResolved: true,
    errors: [] as string[],
  };

  // Boards
  const boardsData = await jiraGet<{
    values?: Array<{ id: number; name: string; type: string; location?: { projectKey?: string; projectName?: string } }>;
  }>(accessToken, "/rest/agile/1.0/board?maxResults=50");

  const boards = boardsData.values ?? [];
  report.boards = boards.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    projectKey: b.location?.projectKey,
    projectName: b.location?.projectName,
  }));

  const cxBoard =
    boards.find((b) => b.location?.projectKey === "CX") ??
    boards.find((b) => /connexus|cx/i.test(b.name)) ??
    boards[0];

  if (!cxBoard) throw new Error("No boards found");

  report.primaryBoard = {
    id: cxBoard.id,
    name: cxBoard.name,
    type: cxBoard.type,
    projectKey: cxBoard.location?.projectKey,
  };

  // Active sprint
  const sprintsData = await jiraGet<{
    values?: Array<{
      id: number;
      name: string;
      state: string;
      startDate?: string;
      endDate?: string;
      goal?: string;
    }>;
  }>(accessToken, `/rest/agile/1.0/board/${cxBoard.id}/sprint?state=active&maxResults=10`);

  const activeSprints = sprintsData.values ?? [];
  if (activeSprints.length === 0) {
    report.activeSprint = null;
    report.note = "No active sprint on primary board";
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const sprint = activeSprints[0];
  report.activeSprint = {
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    goal: sprint.goal ?? null,
  };

  // Story point field discovery
  let storyPointFieldId: string | undefined =
    meta.jiraSchemaSnapshot?.suggestions?.storyPointField?.id;

  if (!storyPointFieldId) {
    try {
      const fields = await listJiraFields(accessToken, cloudId);
      const sp = fields.find((f) => /story point/i.test(f.name));
      storyPointFieldId = sp?.id;
      report.storyPointField = sp ? { id: sp.id, name: sp.name } : null;
    } catch (e) {
      report.errors.push(`Field discovery failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    report.storyPointField = meta.jiraSchemaSnapshot?.suggestions?.storyPointField;
  }

  const searchFields = [
    "summary",
    "status",
    "issuetype",
    "priority",
    "assignee",
    "labels",
  ];
  if (storyPointFieldId) searchFields.push(storyPointFieldId);

  // Fetch all sprint issues (paginated)
  type IssueRow = {
    key: string;
    summary: string;
    status: string;
    statusCategory: StatusCategory;
    issueType: string;
    priority?: string;
    assignee?: string;
    labels: string[];
    storyPoints?: number | null;
  };

  const issues: IssueRow[] = [];
  let nextPageToken: string | undefined;

  do {
    const data = await jiraPost<{
      issues?: Array<{
        key?: string;
        fields?: {
          summary?: string;
          status?: { name?: string; statusCategory?: { key?: string } };
          issuetype?: { name?: string };
          priority?: { name?: string };
          assignee?: { displayName?: string };
          labels?: string[];
          [k: string]: unknown;
        };
      }>;
      nextPageToken?: string;
    }>(accessToken, "/rest/api/3/search/jql", {
      jql: `sprint = ${sprint.id}`,
      maxResults: 50,
      nextPageToken,
      fields: searchFields,
    });

    for (const issue of data.issues ?? []) {
      if (!issue.key) continue;
      const f = issue.fields ?? {};
      const spVal = storyPointFieldId ? (f[storyPointFieldId] as number | null | undefined) : undefined;
      issues.push({
        key: issue.key,
        summary: (f.summary as string) ?? "",
        status: f.status?.name ?? "Unknown",
        statusCategory: f.status?.statusCategory?.key ?? "unknown",
        issueType: f.issuetype?.name ?? "Unknown",
        priority: f.priority?.name,
        assignee: f.assignee?.displayName,
        labels: (f.labels as string[]) ?? [],
        storyPoints: spVal ?? null,
      });
    }
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  const breakdown = { todo: 0, inProgress: 0, done: 0, other: 0 };
  const statusCounts: Record<string, number> = {};
  const spBreakdown = { todo: 0, inProgress: 0, done: 0, other: 0, unestimated: 0, total: 0 };

  for (const issue of issues) {
    const cat = categorize(issue.statusCategory);
    breakdown[cat]++;
    statusCounts[issue.status] = (statusCounts[issue.status] ?? 0) + 1;

    const pts = issue.storyPoints;
    if (pts == null || pts === undefined) {
      spBreakdown.unestimated++;
    } else {
      spBreakdown[cat] += pts;
      spBreakdown.total += pts;
    }
  }

  report.sprintProgress = {
    totalIssues: issues.length,
    statusBreakdown: {
      todo: breakdown.todo,
      inProgress: breakdown.inProgress,
      done: breakdown.done,
      other: breakdown.other,
    },
    byStatusName: statusCounts,
    storyPoints: storyPointFieldId
      ? {
          fieldId: storyPointFieldId,
          committed: spBreakdown.total,
          done: spBreakdown.done,
          inProgress: spBreakdown.inProgress,
          todo: spBreakdown.todo,
          unestimatedIssues: spBreakdown.unestimated,
        }
      : { available: false },
    completionPct:
      issues.length > 0 ? Math.round((breakdown.done / issues.length) * 100) : 0,
  };

  const inProgressSample = issues
    .filter((i) => categorize(i.statusCategory) === "inProgress")
    .slice(0, 8)
    .map((i) => ({ key: i.key, summary: i.summary, status: i.status, assignee: i.assignee }));

  const blockedSample = issues
    .filter(
      (i) =>
        /block/i.test(i.status) ||
        i.labels.some((l) => /block/i.test(l)) ||
        i.priority?.toLowerCase() === "blocker",
    )
    .slice(0, 8)
    .map((i) => ({ key: i.key, summary: i.summary, status: i.status, labels: i.labels }));

  report.samples = { inProgress: inProgressSample, blocked: blockedSample };

  // Cross-check delivery snapshot
  const snapshot = meta.deliverySnapshot;
  if (snapshot) {
    const cxProject = snapshot.projects.find((p) => p.key === "CX" || p.key === cxBoard.location?.projectKey);
    report.deliverySnapshotCrossCheck = cxProject
      ? {
          syncedAt: snapshot.syncedAt,
          activeSprint: cxProject.activeSprint,
          statusBreakdown: cxProject.statusBreakdown,
          openIssues: cxProject.openIssues,
        }
      : { syncedAt: snapshot.syncedAt, note: "CX project not in snapshot" };
  } else {
    report.deliverySnapshotCrossCheck = null;
  }

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }, null, 2));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
