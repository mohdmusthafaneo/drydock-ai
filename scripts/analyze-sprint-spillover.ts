/**
 * Direct Jira API spillover / carry-over analysis for Connexus Sprint 35 (id 807).
 * No AIDOS delivery algorithms — raw Jira data only.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { resolveJiraAccessToken } from "../src/lib/jira-api";

const CLOUD_ID = "212728dc-9989-4872-b3f6-b6ab9cad7d40";
const BOARD_ID = 1;
const SPRINT_35_ID = 807;
const PROJECT_KEY = "CX";
const JIRA_API = `https://api.atlassian.com/ex/jira/${CLOUD_ID}`;

type Sprint = {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
  completeDate?: string;
};

type IssueFields = {
  summary?: string;
  status?: { name?: string; statusCategory?: { key?: string; name?: string } };
  issuetype?: { name?: string };
  priority?: { name?: string };
  assignee?: { displayName?: string };
  created?: string;
  updated?: string;
  resolutiondate?: string;
  labels?: string[];
};

type IssueRow = {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  issueType: string;
  priority?: string;
  assignee?: string;
  created?: string;
  updated?: string;
  resolutionDate?: string;
  labels: string[];
};

type SprintChange = {
  at: string;
  from: string | null;
  to: string | null;
  author?: string;
};

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

function isDone(cat: string | undefined): boolean {
  return cat === "done";
}

function isOpen(cat: string | undefined): boolean {
  return cat !== "done";
}

function parseIssue(issue: { key?: string; fields?: IssueFields }): IssueRow | null {
  if (!issue.key) return null;
  const f = issue.fields ?? {};
  return {
    key: issue.key,
    summary: f.summary ?? "",
    status: f.status?.name ?? "Unknown",
    statusCategory: f.status?.statusCategory?.key ?? "unknown",
    issueType: f.issuetype?.name ?? "Unknown",
    priority: f.priority?.name,
    assignee: f.assignee?.displayName,
    created: f.created,
    updated: f.updated,
    resolutionDate: f.resolutiondate,
    labels: f.labels ?? [],
  };
}

async function searchAllIssues(
  token: string,
  jql: string,
  fields: string[],
  expand?: string,
): Promise<IssueRow[]> {
  const issues: IssueRow[] = [];
  let nextPageToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      jql,
      maxResults: 50,
      nextPageToken,
      fields,
    };
    if (expand) body.expand = expand;

    const data = await jiraPost<{
      issues?: Array<{ key?: string; fields?: IssueFields }>;
      nextPageToken?: string;
    }>(token, "/rest/api/3/search/jql", body);

    for (const issue of data.issues ?? []) {
      const row = parseIssue(issue);
      if (row) issues.push(row);
    }
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return issues;
}

async function countByJql(token: string, jql: string): Promise<number> {
  const data = await jiraPost<{ count?: number }>(token, "/rest/api/3/search/approximate-count", {
    jql,
  });
  return data.count ?? 0;
}

async function fetchSprintChanges(token: string, issueKey: string): Promise<SprintChange[]> {
  const changes: SprintChange[] = [];
  let startAt = 0;
  const maxPerPage = 100;

  while (true) {
    const data = await jiraGet<{
      values?: Array<{
        created?: string;
        author?: { displayName?: string };
        items?: Array<{ field?: string; fromString?: string; toString?: string }>;
      }>;
      total?: number;
      maxResults?: number;
      startAt?: number;
    }>(
      token,
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=${maxPerPage}`,
    );

    for (const history of data.values ?? []) {
      for (const item of history.items ?? []) {
        if (item.field?.toLowerCase() !== "sprint") continue;
        changes.push({
          at: history.created ?? "",
          from: item.fromString ?? null,
          to: item.toString ?? null,
          author: history.author?.displayName,
        });
      }
    }

    const total = data.total ?? 0;
    startAt += data.maxResults ?? maxPerPage;
    if (startAt >= total) break;
  }

  return changes.sort((a, b) => a.at.localeCompare(b.at));
}

function sprintNamesFromChange(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function sprintIdFromName(name: string, sprints: Sprint[]): number | null {
  const match = sprints.find((s) => s.name === name || name.includes(s.name) || s.name.includes(name));
  return match?.id ?? null;
}

function wasInPriorSprint(
  changes: SprintChange[],
  priorSprint: Sprint,
  targetSprint: Sprint,
): boolean {
  const priorName = priorSprint.name;
  const targetName = targetSprint.name;

  for (const c of changes) {
    const fromNames = sprintNamesFromChange(c.from);
    const toNames = sprintNamesFromChange(c.to);
    const inFrom = fromNames.some((n) => n.includes(priorName) || priorName.includes(n));
    const inTo = toNames.some((n) => n.includes(targetName) || targetName.includes(n));
    if (inFrom && inTo) return true;
  }

  // Also check if prior sprint name appears in any 'from' before target sprint start
  const targetStart = targetSprint.startDate ?? "";
  for (const c of changes) {
    if (targetStart && c.at > targetStart) continue;
    const fromNames = sprintNamesFromChange(c.from);
    if (fromNames.some((n) => n.includes(priorName) || priorName.includes(n))) return true;
  }
  return false;
}

function removedFromSprintRecently(changes: SprintChange[], sprint: Sprint, days = 14): SprintChange[] {
  const sprintName = sprint.name;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return changes.filter((c) => {
    if (new Date(c.at) < cutoff) return false;
    const fromNames = sprintNamesFromChange(c.from);
    const toNames = sprintNamesFromChange(c.to);
    const wasIn = fromNames.some((n) => n.includes(sprintName) || sprintName.includes(n));
    const nowIn = toNames.some((n) => n.includes(sprintName) || sprintName.includes(n));
    return wasIn && !nowIn;
  });
}

function addedToSprintFromOther(changes: SprintChange[], sprint: Sprint): SprintChange | null {
  const sprintName = sprint.name;
  for (const c of changes) {
    const fromNames = sprintNamesFromChange(c.from);
    const toNames = sprintNamesFromChange(c.to);
    const nowIn = toNames.some((n) => n.includes(sprintName) || sprintName.includes(n));
    const wasIn = fromNames.some((n) => n.includes(sprintName) || sprintName.includes(n));
    if (nowIn && !wasIn && fromNames.length > 0) return c;
  }
  return null;
}

async function sprintCompletionStats(
  token: string,
  sprint: Sprint,
): Promise<{ total: number; done: number; open: number; completionPct: number }> {
  const issues = await searchAllIssues(token, `sprint = ${sprint.id}`, [
    "status",
    "summary",
  ]);
  const done = issues.filter((i) => isDone(i.statusCategory)).length;
  const open = issues.length - done;
  return {
    total: issues.length,
    done,
    open,
    completionPct: issues.length > 0 ? Math.round((done / issues.length) * 100) : 0,
  };
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "connexus" } });
  if (!org) throw new Error("Organization connexus not found");

  const integration = await prisma.integration.findUnique({
    where: { organizationId_provider: { organizationId: org.id, provider: "JIRA" } },
  });
  if (!integration) throw new Error("JIRA integration not found for connexus");

  const { accessToken } = await resolveJiraAccessToken(integration);

  // 1. Closed sprints on board 1
  const closedSprintsData = await jiraGet<{ values?: Sprint[] }>(
    accessToken,
    `/rest/agile/1.0/board/${BOARD_ID}/sprint?state=closed&maxResults=50`,
  );
  const allClosed = (closedSprintsData.values ?? []).sort((a, b) => {
    const da = a.completeDate ?? a.endDate ?? "";
    const db = b.completeDate ?? b.endDate ?? "";
    return db.localeCompare(da);
  });
  const recentClosed = allClosed.slice(0, 5);

  const closedWithStats: Array<Sprint & { total: number; done: number; open: number; completionPct: number }> = [];
  for (const s of recentClosed) {
    const stats = await sprintCompletionStats(accessToken, s);
    closedWithStats.push({ ...s, ...stats });
  }

  // Sprint 35 details
  const sprint35 = await jiraGet<Sprint>(
    accessToken,
    `/rest/agile/1.0/sprint/${SPRINT_35_ID}`,
  );

  // Find Sprint 34 (prior closed sprint before 35)
  const sprint34 = allClosed.find((s) => s.id !== SPRINT_35_ID && /34/i.test(s.name)) ??
    allClosed.find((s) => {
      const end = s.endDate ?? s.completeDate ?? "";
      const s35Start = sprint35.startDate ?? "";
      return end && s35Start && end < s35Start;
    });

  const priorSprint = sprint34 ?? recentClosed.find((s) => s.id !== SPRINT_35_ID) ?? null;

  // All issues in Sprint 35
  const sprint35Issues = await searchAllIssues(
    accessToken,
    `sprint = ${SPRINT_35_ID}`,
    [
      "summary",
      "status",
      "issuetype",
      "priority",
      "assignee",
      "created",
      "updated",
      "resolutiondate",
      "labels",
    ],
  );

  const sprint35Start = sprint35.startDate ? new Date(sprint35.startDate) : null;
  const sprint35End = sprint35.endDate ? new Date(sprint35.endDate) : null;

  // 3. Heuristic carry-in: created before sprint start, still in sprint 35
  const carryInHeuristic = sprint35Issues.filter((i) => {
    if (!sprint35Start || !i.created) return false;
    return new Date(i.created) < sprint35Start;
  });

  // 4. Likely spill OUT: still open (sprint ended Jun 30)
  const spillOutCandidates = sprint35Issues.filter((i) => isOpen(i.statusCategory));

  // Sprint 34 issues for comparison
  let sprint34Issues: IssueRow[] = [];
  if (sprint34) {
    sprint34Issues = await searchAllIssues(accessToken, `sprint = ${sprint34.id}`, [
      "summary",
      "status",
      "created",
      "resolutiondate",
    ]);
  }

  // Changelog analysis for sprint 35 issues (sample all, prioritize carry-in + open)
  const changelogTargets = [
    ...new Set([
      ...carryInHeuristic.map((i) => i.key),
      ...spillOutCandidates.map((i) => i.key),
      ...sprint35Issues.slice(0, 30).map((i) => i.key),
    ]),
  ];

  const changelogByKey = new Map<string, SprintChange[]>();
  for (const key of changelogTargets) {
    try {
      changelogByKey.set(key, await fetchSprintChanges(accessToken, key));
    } catch {
      changelogByKey.set(key, []);
    }
  }

  // 2. Issues in Sprint 35 that were also in prior sprint (changelog)
  const alsoInPriorSprint: Array<{
    key: string;
    summary: string;
    status: string;
    priorSprint: string;
    evidence: string;
  }> = [];

  if (priorSprint) {
    for (const issue of sprint35Issues) {
      const changes = changelogByKey.get(issue.key) ?? (await fetchSprintChanges(accessToken, issue.key));
      if (!changelogByKey.has(issue.key)) changelogByKey.set(issue.key, changes);

      if (wasInPriorSprint(changes, priorSprint, sprint35)) {
        const addChange = addedToSprintFromOther(changes, sprint35);
        alsoInPriorSprint.push({
          key: issue.key,
          summary: issue.summary,
          status: issue.status,
          priorSprint: priorSprint.name,
          evidence: addChange
            ? `Sprint field changed ${addChange.at}: "${addChange.from}" → "${addChange.to}"`
            : "Prior sprint name found in sprint changelog history",
        });
      }
    }
  }

  // 3 refined: carry-in with changelog evidence
  const carryInFromPrior: Array<{
    key: string;
    summary: string;
    status: string;
    created: string;
    evidence: string;
  }> = [];

  for (const issue of carryInHeuristic) {
    const changes = changelogByKey.get(issue.key) ?? [];
    const addChange = addedToSprintFromOther(changes, sprint35);
    const fromPrior =
      priorSprint &&
      changes.some((c) => {
        const from = sprintNamesFromChange(c.from);
        return from.some((n) => n.includes(priorSprint.name) || priorSprint.name.includes(n));
      });

    carryInFromPrior.push({
      key: issue.key,
      summary: issue.summary,
      status: issue.status,
      created: issue.created ?? "",
      evidence: addChange
        ? `Added to ${sprint35.name} on ${addChange.at}`
        : fromPrior
          ? `Was in ${priorSprint!.name} per changelog`
          : `Created before sprint start (${issue.created})`,
    });
  }

  // 5. Closed sprint issues still open (in sprint 35 but status not done)
  const statusMismatchInClosedSprint = recentClosed
    .filter((s) => s.id !== SPRINT_35_ID)
    .slice(0, 3);

  const closedSprintOpenIssues: Array<{
    sprintId: number;
    sprintName: string;
    key: string;
    summary: string;
    status: string;
  }> = [];

  for (const s of statusMismatchInClosedSprint) {
    const issues = await searchAllIssues(accessToken, `sprint = ${s.id} AND statusCategory != Done`, [
      "summary",
      "status",
    ]);
    for (const i of issues) {
      closedSprintOpenIssues.push({
        sprintId: s.id,
        sprintName: s.name,
        key: i.key,
        summary: i.summary,
        status: i.status,
      });
    }
  }

  // 7. Multi-sprint / recent removals
  const multiSprintOrRemoved: Array<{
    key: string;
    summary: string;
    status: string;
    type: "multi_sprint" | "removed_from_sprint";
    detail: string;
  }> = [];

  for (const issue of sprint35Issues) {
    const changes = changelogByKey.get(issue.key);
    if (!changes) continue;

    const allSprintNames = new Set<string>();
    for (const c of changes) {
      for (const n of [...sprintNamesFromChange(c.from), ...sprintNamesFromChange(c.to)]) {
        if (n) allSprintNames.add(n);
      }
    }
    if (allSprintNames.size > 1) {
      multiSprintOrRemoved.push({
        key: issue.key,
        summary: issue.summary,
        status: issue.status,
        type: "multi_sprint",
        detail: [...allSprintNames].join(" | "),
      });
    }

    const removals = removedFromSprintRecently(changes, sprint35);
    for (const r of removals) {
      multiSprintOrRemoved.push({
        key: issue.key,
        summary: issue.summary,
        status: issue.status,
        type: "removed_from_sprint",
        detail: `${r.at}: "${r.from}" → "${r.to}" by ${r.author ?? "unknown"}`,
      });
    }
  }

  // Severity
  const total35 = sprint35Issues.length;
  const open35 = spillOutCandidates.length;
  const carryInCount = carryInHeuristic.length;
  const carryInPct = total35 > 0 ? Math.round((carryInCount / total35) * 100) : 0;
  const spillOutPct = total35 > 0 ? Math.round((open35 / total35) * 100) : 0;
  const priorOverlapCount = alsoInPriorSprint.length;

  let severity: "low" | "medium" | "high" | "critical" = "low";
  const reasons: string[] = [];
  if (spillOutPct >= 40) {
    severity = "critical";
    reasons.push(`${spillOutPct}% of Sprint 35 issues still open after sprint end`);
  } else if (spillOutPct >= 25 || carryInPct >= 30) {
    severity = "high";
    reasons.push(`Significant spillover: ${open35} open issues, ${carryInCount} carry-in`);
  } else if (spillOutPct >= 15 || carryInPct >= 20 || priorOverlapCount >= 5) {
    severity = "medium";
    reasons.push(`Moderate carry-over detected`);
  } else {
    reasons.push(`Spillover within normal range`);
  }
  if (closedSprintOpenIssues.length > 0) {
    reasons.push(`${closedSprintOpenIssues.length} issues in closed sprints still not Done`);
    if (severity === "low") severity = "medium";
  }

  const report = {
    meta: {
      project: PROJECT_KEY,
      boardId: BOARD_ID,
      analyzedAt: new Date().toISOString(),
      sprint35: {
        id: sprint35.id,
        name: sprint35.name,
        state: sprint35.state,
        startDate: sprint35.startDate,
        endDate: sprint35.endDate,
        completeDate: sprint35.completeDate,
      },
      priorSprint: priorSprint
        ? { id: priorSprint.id, name: priorSprint.name, endDate: priorSprint.endDate }
        : null,
    },
    recentClosedSprints: closedWithStats.map((s) => ({
      id: s.id,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      completeDate: s.completeDate,
      totalIssues: s.total,
      done: s.done,
      open: s.open,
      completionPct: s.completionPct,
    })),
    sprintComparison: sprint34
      ? {
          sprint34: {
            id: sprint34.id,
            name: sprint34.name,
            issueCount: sprint34Issues.length,
            done: sprint34Issues.filter((i) => isDone(i.statusCategory)).length,
            open: sprint34Issues.filter((i) => isOpen(i.statusCategory)).length,
          },
          sprint35: {
            id: sprint35.id,
            name: sprint35.name,
            issueCount: sprint35Issues.length,
            done: sprint35Issues.filter((i) => isDone(i.statusCategory)).length,
            open: spillOutCandidates.length,
          },
          deltaIssueCount: sprint35Issues.length - sprint34Issues.length,
        }
      : null,
    spillover: {
      severity,
      severityReasons: reasons,
      counts: {
        sprint35Total: total35,
        carryInHeuristic: carryInCount,
        carryInPct,
        carryInFromPriorChangelog: alsoInPriorSprint.length,
        spillOutOpen: open35,
        spillOutPct,
        closedSprintStatusMismatch: closedSprintOpenIssues.length,
        multiSprintOrRecentRemoval: multiSprintOrRemoved.length,
      },
      carryInHeuristicKeys: carryInHeuristic.map((i) => i.key),
      carryInFromPrior: carryInFromPrior,
      alsoInPriorSprint,
      spillOutKeys: spillOutCandidates.map((i) => ({
        key: i.key,
        summary: i.summary,
        status: i.status,
        assignee: i.assignee,
      })),
      closedSprintOpenIssues,
      multiSprintOrRemoved,
    },
    sprint35StatusBreakdown: {
      done: sprint35Issues.filter((i) => isDone(i.statusCategory)).length,
      inProgress: sprint35Issues.filter((i) => i.statusCategory === "indeterminate").length,
      todo: sprint35Issues.filter((i) => i.statusCategory === "new").length,
      byStatus: Object.fromEntries(
        Object.entries(
          sprint35Issues.reduce<Record<string, number>>((acc, i) => {
            acc[i.status] = (acc[i.status] ?? 0) + 1;
            return acc;
          }, {}),
        ),
      ),
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
