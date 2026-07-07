/**
 * Connexus Sprint 35 (807) — direct Jira API risk profile.
 * Run: npx tsx scripts/connexus-sprint35-risk-profile.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { resolveJiraAccessToken, listJiraFields } from "../src/lib/jira-api";
import { parseJiraMeta } from "../src/lib/jira-meta";

const CLOUD_ID = "212728dc-9989-4872-b3f6-b6ab9cad7d40";
const SPRINT_ID = 807;
const JIRA_API = `https://api.atlassian.com/ex/jira/${CLOUD_ID}`;

async function jiraGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${JIRA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jira ${res.status} ${path}: ${text.slice(0, 400)}`);
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
    throw new Error(`Jira ${res.status} ${path}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

type StatusCategory = "new" | "indeterminate" | "done" | string;

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
  created: string;
  updated: string;
  lastStatusChangeAt?: string;
};

function categorize(cat: StatusCategory): "todo" | "inProgress" | "done" | "other" {
  if (cat === "new") return "todo";
  if (cat === "indeterminate") return "inProgress";
  if (cat === "done") return "done";
  return "other";
}

function isOpen(issue: IssueRow): boolean {
  return categorize(issue.statusCategory) !== "done";
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function parseLastStatusChange(changelog?: {
  histories?: Array<{
    created?: string;
    items?: Array<{ field?: string; toString?: string }>;
  }>;
}): string | undefined {
  let last: string | undefined;
  for (const history of changelog?.histories ?? []) {
    const hasStatus = (history.items ?? []).some((i) => i.field?.toLowerCase() === "status");
    if (hasStatus && history.created) last = history.created;
  }
  return last;
}

function fmtKeys(keys: string[], limit = 20): string {
  if (keys.length === 0) return "_none_";
  const shown = keys.slice(0, limit);
  const suffix = keys.length > limit ? ` (+${keys.length - limit} more)` : "";
  return shown.join(", ") + suffix;
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "connexus" } });
  if (!org) throw new Error("Organization connexus not found");

  const integration = await prisma.integration.findUnique({
    where: { organizationId_provider: { organizationId: org.id, provider: "JIRA" } },
  });
  if (!integration) throw new Error("JIRA integration not found for connexus");

  const meta = parseJiraMeta(integration.metadataJson);
  const { accessToken } = await resolveJiraAccessToken(integration);

  const sprint = await jiraGet<{
    id: number;
    name: string;
    state: string;
    startDate?: string;
    endDate?: string;
    goal?: string;
    originBoardId?: number;
  }>(accessToken, `/rest/agile/1.0/sprint/${SPRINT_ID}`);

  let storyPointFieldId: string | undefined =
    meta.jiraSchemaSnapshot?.suggestions?.storyPointField?.id;
  if (!storyPointFieldId) {
    const fields = await listJiraFields(accessToken, CLOUD_ID);
    storyPointFieldId = fields.find((f) => /story point/i.test(f.name))?.id;
  }

  const searchFields = [
    "summary",
    "status",
    "issuetype",
    "priority",
    "assignee",
    "labels",
    "created",
    "updated",
  ];
  if (storyPointFieldId) searchFields.push(storyPointFieldId);

  const issues: IssueRow[] = [];
  let nextPageToken: string | undefined;

  do {
    const data = await jiraPost<{
      issues?: Array<{
        key?: string;
        changelog?: {
          histories?: Array<{
            created?: string;
            items?: Array<{ field?: string; toString?: string }>;
          }>;
        };
        fields?: Record<string, unknown>;
      }>;
      nextPageToken?: string;
    }>(accessToken, "/rest/api/3/search/jql", {
      jql: `sprint = ${SPRINT_ID}`,
      maxResults: 50,
      nextPageToken,
      fields: searchFields,
      expand: "changelog",
    });

    for (const issue of data.issues ?? []) {
      if (!issue.key) continue;
      const f = issue.fields ?? {};
      const status = f.status as { name?: string; statusCategory?: { key?: string } } | undefined;
      const spVal = storyPointFieldId ? (f[storyPointFieldId] as number | null | undefined) : undefined;
      issues.push({
        key: issue.key,
        summary: (f.summary as string) ?? "",
        status: status?.name ?? "Unknown",
        statusCategory: status?.statusCategory?.key ?? "unknown",
        issueType: (f.issuetype as { name?: string })?.name ?? "Unknown",
        priority: (f.priority as { name?: string })?.name,
        assignee: (f.assignee as { displayName?: string })?.displayName,
        labels: (f.labels as string[]) ?? [],
        storyPoints: spVal ?? null,
        created: (f.created as string) ?? "",
        updated: (f.updated as string) ?? "",
        lastStatusChangeAt: parseLastStatusChange(issue.changelog),
      });
    }
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  const now = new Date();
  const endDate = sprint.endDate ? new Date(sprint.endDate) : null;
  const daysPastDeadline = endDate && endDate < now ? daysBetween(endDate, now) : 0;
  const openIssues = issues.filter(isOpen);
  const doneIssues = issues.filter((i) => categorize(i.statusCategory) === "done");

  const unestimated = issues.filter((i) => i.storyPoints == null);
  const unestimatedPct = issues.length > 0 ? (unestimated.length / issues.length) * 100 : 0;

  const highPriorityOpen = openIssues.filter((i) => {
    const p = (i.priority ?? "").toLowerCase();
    return p === "critical" || p === "highest" || p === "high" || p === "blocker";
  });

  const reopened = openIssues.filter(
    (i) => /reopen/i.test(i.status) || i.labels.some((l) => /reopen/i.test(l)),
  );

  const onHold = openIssues.filter(
    (i) =>
      /hold|on-hold|on hold/i.test(i.status) ||
      i.labels.some((l) => /hold|on-hold/i.test(l)),
  );

  const blocked = openIssues.filter(
    (i) =>
      /block/i.test(i.status) ||
      i.labels.some((l) => /block/i.test(l)) ||
      (i.priority ?? "").toLowerCase() === "blocker",
  );

  const stuckThreshold = new Date(now);
  stuckThreshold.setDate(stuckThreshold.getDate() - 7);

  const stuckInStatus = openIssues.filter((i) => {
    const ref = i.lastStatusChangeAt ? new Date(i.lastStatusChangeAt) : new Date(i.updated);
    return ref < stuckThreshold;
  });

  const testingStatuses = ["ready for testing", "in test", "ready for review"];
  const testingBottleneck = openIssues.filter((i) =>
    testingStatuses.some((s) => i.status.toLowerCase().includes(s)),
  );

  const unassignedOpen = openIssues.filter((i) => !i.assignee);

  const assigneeCounts: Record<string, number> = {};
  for (const i of openIssues) {
    const who = i.assignee ?? "Unassigned";
    assigneeCounts[who] = (assigneeCounts[who] ?? 0) + 1;
  }
  const assigneeSorted = Object.entries(assigneeCounts).sort((a, b) => b[1] - a[1]);

  const criticalInSummaryOrLabels = openIssues.filter(
    (i) =>
      /critical|blocker/i.test(i.summary) ||
      i.labels.some((l) => /critical|blocker/i.test(l)),
  );

  const oldBacklogPulled = openIssues.filter((i) => {
    const created = new Date(i.created);
    const sprintStart = sprint.startDate ? new Date(sprint.startDate) : null;
    const ageDays = daysBetween(created, now);
    const isNamedOld = /^(CX-125|CX-2509)$/i.test(i.key);
    const oldByAge = ageDays > 90;
    const predatesSprint = sprintStart ? created < sprintStart && ageDays > 30 : ageDays > 60;
    return isNamedOld || (oldByAge && predatesSprint);
  });

  const statusCounts: Record<string, number> = {};
  for (const i of openIssues) {
    statusCounts[i.status] = (statusCounts[i.status] ?? 0) + 1;
  }

  type Risk = {
    id: string;
    category: string;
    title: string;
    severity: "High" | "Medium" | "Low";
    evidence: string;
    action: string;
    score: number;
  };

  const risks: Risk[] = [];

  if (sprint.state === "active" && daysPastDeadline > 0) {
    risks.push({
      id: "delivery-overdue",
      category: "Delivery",
      title: "Sprint overdue — still active past end date",
      severity: daysPastDeadline >= 7 ? "High" : "Medium",
      evidence: `Sprint **${sprint.name}** (id ${sprint.id}) ended **${endDate?.toISOString().slice(0, 10)}**; today is **${now.toISOString().slice(0, 10)}** — **${daysPastDeadline} days** overdue. State: \`${sprint.state}\`.`,
      action: "Close or extend sprint formally; triage remaining scope and move non-critical items to backlog or next sprint.",
      score: daysPastDeadline >= 14 ? 9 : daysPastDeadline >= 7 ? 8 : 6,
    });
  }

  if (openIssues.length > 0) {
    const severity =
      openIssues.length >= 30 || (daysPastDeadline > 0 && openIssues.length / Math.max(daysPastDeadline, 1) > 3)
        ? "High"
        : openIssues.length >= 15
          ? "Medium"
          : "Low";
    risks.push({
      id: "open-volume",
      category: "Delivery",
      title: "High open work volume vs deadline slip",
      severity,
      evidence: `**${openIssues.length}** open of **${issues.length}** total (${doneIssues.length} done, ${Math.round((doneIssues.length / issues.length) * 100)}% complete). ${daysPastDeadline > 0 ? `${daysPastDeadline} days past deadline.` : ""}`,
      action: "Daily standup focus on WIP limits; cut or defer lowest-value open items.",
      score: severity === "High" ? 8 : severity === "Medium" ? 6 : 4,
    });
  }

  if (highPriorityOpen.length > 0) {
    risks.push({
      id: "high-priority-open",
      category: "Delivery",
      title: "Critical/high priority items still open",
      severity: highPriorityOpen.length >= 3 ? "High" : "Medium",
      evidence: `**${highPriorityOpen.length}** open: ${fmtKeys(highPriorityOpen.map((i) => `${i.key} (${i.priority})`))}`,
      action: "Escalate owners; unblock or re-scope highest priority items first.",
      score: highPriorityOpen.length >= 5 ? 9 : 7,
    });
  }

  if (reopened.length > 0) {
    risks.push({
      id: "reopened",
      category: "Delivery",
      title: "Reopened items in sprint",
      severity: reopened.length >= 2 ? "High" : "Medium",
      evidence: `**${reopened.length}**: ${fmtKeys(reopened.map((i) => i.key))}`,
      action: "Root-cause reopened defects; add regression coverage before closing again.",
      score: reopened.length >= 3 ? 7 : 5,
    });
  }

  if (onHold.length > 0) {
    risks.push({
      id: "on-hold",
      category: "Delivery",
      title: "On-hold items consuming sprint capacity",
      severity: onHold.length >= 2 ? "High" : "Medium",
      evidence: `**${onHold.length}**: ${fmtKeys(onHold.map((i) => `${i.key} (${i.status})`))}`,
      action: "Resolve blockers or remove from active sprint to free capacity.",
      score: 6,
    });
  }

  if (blocked.length > 0) {
    risks.push({
      id: "blocked",
      category: "Delivery",
      title: "Blocked items",
      severity: blocked.length >= 2 ? "High" : "Medium",
      evidence: `**${blocked.length}**: ${fmtKeys(blocked.map((i) => `${i.key} (${i.status})`))}`,
      action: "Assign blocker owners with SLA; escalate external dependencies.",
      score: blocked.length >= 3 ? 8 : 6,
    });
  }

  if (stuckInStatus.length > 0) {
    risks.push({
      id: "stuck-status",
      category: "Delivery",
      title: "Items stuck in same status >7 days",
      severity: stuckInStatus.length >= 5 ? "High" : stuckInStatus.length >= 2 ? "Medium" : "Low",
      evidence: `**${stuckInStatus.length}**: ${fmtKeys(stuckInStatus.map((i) => `${i.key} [${i.status}]`))}`,
      action: "Review each stuck item in standup; force status transition or reassign.",
      score: stuckInStatus.length >= 5 ? 7 : 5,
    });
  }

  if (unestimatedPct >= 93) {
    risks.push({
      id: "unestimated",
      category: "Quality/Process",
      title: "Very high proportion of unestimated issues",
      severity: unestimatedPct >= 95 ? "High" : "Medium",
      evidence: `**${unestimated.length}/${issues.length}** (${unestimatedPct.toFixed(1)}%) lack story points${storyPointFieldId ? "" : " (story point field not found — count may include all issues)"}.`,
      action: "Estimate remaining open items or switch to t-shirt sizing for planning visibility.",
      score: unestimatedPct >= 95 ? 8 : 6,
    });
  } else if (unestimatedPct >= 70) {
    risks.push({
      id: "unestimated",
      category: "Quality/Process",
      title: "Majority of issues unestimated",
      severity: "Medium",
      evidence: `**${unestimated.length}/${issues.length}** (${unestimatedPct.toFixed(1)}%) lack story points.`,
      action: "Backfill estimates on open work for velocity tracking.",
      score: 5,
    });
  }

  const hasGoal = Boolean(sprint.goal?.trim());
  if (!hasGoal) {
    risks.push({
      id: "no-goal",
      category: "Quality/Process",
      title: "No sprint goal defined",
      severity: "Medium",
      evidence: `Sprint goal field is empty for **${sprint.name}**.`,
      action: "Define a measurable sprint goal to align team and stakeholders.",
      score: 5,
    });
  }

  if (testingBottleneck.length >= 3) {
    risks.push({
      id: "testing-bottleneck",
      category: "Quality/Process",
      title: "Testing/review bottleneck",
      severity: testingBottleneck.length >= 6 ? "High" : "Medium",
      evidence: `**${testingBottleneck.length}** in testing/review: ${fmtKeys(testingBottleneck.map((i) => `${i.key} (${i.status})`))}`,
      action: "Add QA capacity; pair dev+QA on oldest items; define test exit criteria.",
      score: testingBottleneck.length >= 6 ? 7 : 5,
    });
  }

  if (unassignedOpen.length > 0) {
    risks.push({
      id: "unassigned",
      category: "Quality/Process",
      title: "Unassigned open issues",
      severity: unassignedOpen.length >= 5 ? "High" : unassignedOpen.length >= 2 ? "Medium" : "Low",
      evidence: `**${unassignedOpen.length}**: ${fmtKeys(unassignedOpen.map((i) => i.key))}`,
      action: "Assign owners before next standup; no unowned work in overdue sprint.",
      score: unassignedOpen.length >= 5 ? 7 : 4,
    });
  }

  const topAssignee = assigneeSorted[0];
  const secondAssignee = assigneeSorted[1];
  if (topAssignee && openIssues.length >= 5) {
    const [name, count] = topAssignee;
    const pct = (count / openIssues.length) * 100;
    const isSpof = count >= 8 || (secondAssignee && count >= secondAssignee[1] * 2);
    risks.push({
      id: "assignee-concentration",
      category: "People",
      title: "Assignee concentration / single point of failure",
      severity: isSpof ? "High" : pct >= 40 ? "Medium" : "Low",
      evidence: `Top: **${name}** — ${count} open (${pct.toFixed(0)}%). Full distribution: ${assigneeSorted.slice(0, 8).map(([n, c]) => `${n}: ${c}`).join("; ")}`,
      action: "Rebalance load; cross-train backup for top assignee's critical items.",
      score: isSpof ? 8 : 5,
    });
  }

  if (criticalInSummaryOrLabels.length > 0) {
    risks.push({
      id: "technical-critical",
      category: "Technical",
      title: "Items flagged Critical/Blocker in summary or labels",
      severity: criticalInSummaryOrLabels.length >= 2 ? "High" : "Medium",
      evidence: `**${criticalInSummaryOrLabels.length}**: ${fmtKeys(criticalInSummaryOrLabels.map((i) => i.key))}`,
      action: "Validate severity; ensure dedicated owners and daily check-ins.",
      score: 7,
    });
  }

  if (oldBacklogPulled.length > 0) {
    risks.push({
      id: "old-backlog",
      category: "Technical",
      title: "Large/old backlog items pulled into sprint",
      severity: oldBacklogPulled.length >= 2 ? "High" : "Medium",
      evidence: `**${oldBacklogPulled.length}**: ${fmtKeys(oldBacklogPulled.map((i) => `${i.key} (created ${i.created.slice(0, 10)})`))}`,
      action: "Split epics; confirm scope still valid; avoid carry-over without re-estimation.",
      score: 6,
    });
  }

  risks.sort((a, b) => b.score - a.score);
  const top5 = risks.slice(0, 5);

  let health = 10;
  for (const r of risks) {
    if (r.severity === "High") health -= 1.5;
    else if (r.severity === "Medium") health -= 0.7;
    else health -= 0.3;
  }
  if (daysPastDeadline > 7) health -= 1;
  if (openIssues.length > 0 && doneIssues.length / issues.length < 0.5) health -= 1;
  health = Math.max(1, Math.min(10, Math.round(health * 10) / 10));

  const lines: string[] = [];
  lines.push(`# Connexus Jira — Sprint 35 Risk Profile`);
  lines.push("");
  lines.push(`**Generated:** ${now.toISOString().slice(0, 10)} | **Site:** ${meta.siteUrl ?? "Connexus Jira Cloud"}`);
  lines.push("");
  lines.push(`## Sprint snapshot`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Sprint | ${sprint.name} (id **${sprint.id}**) |`);
  lines.push(`| State | \`${sprint.state}\` |`);
  lines.push(`| Start | ${sprint.startDate?.slice(0, 10) ?? "—"} |`);
  lines.push(`| End | ${sprint.endDate?.slice(0, 10) ?? "—"} |`);
  lines.push(`| Days past deadline | **${daysPastDeadline}** |`);
  lines.push(`| Goal | ${hasGoal ? sprint.goal : "_None set_"} |`);
  lines.push(`| Total issues | ${issues.length} |`);
  lines.push(`| Open / Done | **${openIssues.length}** / ${doneIssues.length} (${issues.length ? Math.round((doneIssues.length / issues.length) * 100) : 0}% done) |`);
  lines.push(`| Unestimated | ${unestimated.length}/${issues.length} (**${unestimatedPct.toFixed(1)}%**) |`);
  lines.push("");
  lines.push(`### Open by status`);
  lines.push("");
  for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${status}**: ${count}`);
  }
  lines.push("");
  lines.push(`## Risk register`);
  lines.push("");

  const byCategory = ["Delivery", "Quality/Process", "People", "Technical"] as const;
  for (const cat of byCategory) {
    const catRisks = risks.filter((r) => r.category === cat);
    if (catRisks.length === 0) continue;
    lines.push(`### ${cat} risks`);
    lines.push("");
    for (const r of catRisks) {
      lines.push(`#### ${r.title} — **${r.severity}**`);
      lines.push("");
      lines.push(`**Evidence:** ${r.evidence}`);
      lines.push("");
      lines.push(`**Recommended action:** ${r.action}`);
      lines.push("");
    }
  }

  lines.push(`## Overall assessment`);
  lines.push("");
  lines.push(`### Sprint health score: **${health}/10**`);
  lines.push("");
  lines.push(`### Top 5 risks (ranked)`);
  lines.push("");
  top5.forEach((r, i) => {
    lines.push(`${i + 1}. **[${r.severity}]** ${r.title} — ${r.evidence.split(".")[0]}`);
  });
  lines.push("");

  console.log(lines.join("\n"));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
