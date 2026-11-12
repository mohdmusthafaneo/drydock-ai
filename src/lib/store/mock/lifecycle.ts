import type { TimeRange } from "@/lib/delivery-analysis/types";
import type { ScheduleRiskItem } from "@/lib/delivery-analysis/types";
import {
  buildLifecycleSnapshotFromIssues,
  enrichLifecycleIssue,
} from "@/lib/delivery-analysis/lifecycle-compute";
import type {
  LifecycleIssue,
  LifecycleSnapshot,
  LifecycleTransition,
} from "@/lib/delivery-analysis/lifecycle-types";
import type { OverviewDerivedPack } from "@/lib/store/mock/overview-derived";

const ASSIGNEE_POOL: Record<string, string[]> = {
  AVENGERS: ["Alex Rivera", "Jordan Lee", "Sam Okonkwo", "Priya Shah"],
  APEX: ["Casey Nguyen", "Morgan Blake", "Riley Chen"],
  DARK: ["Taylor Brooks", "Jamie Park", "Drew Santos"],
  MOBILE: ["Quinn Torres", "Avery Kim"],
  UNASSIGNED: ["Unassigned"],
  default: ["Alex Rivera", "Casey Nguyen", "Taylor Brooks", "Quinn Torres", "Morgan Blake"],
};

function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickAssignee(teamKey: string | undefined, key: string): string {
  const pool = ASSIGNEE_POOL[teamKey ?? ""] ?? ASSIGNEE_POOL.default!;
  return pool[hashKey(key) % pool.length]!;
}

function daysAgoIso(now: number, days: number, hourOffset = 0): string {
  return new Date(now - (days * 24 + hourOffset) * 60 * 60 * 1000).toISOString();
}

function synthesizeTransitions(input: {
  key: string;
  status: string;
  created: string;
  resolutionDate?: string;
  nowIso: string;
}): LifecycleTransition[] {
  const h = hashKey(input.key);
  const createdMs = Date.parse(input.created);
  const endMs = input.resolutionDate
    ? Date.parse(input.resolutionDate)
    : Date.parse(input.nowIso);
  const span = Math.max(endMs - createdMs, 24 * 60 * 60 * 1000);

  const todoAt = new Date(createdMs).toISOString();
  const inProgressAt = new Date(createdMs + span * (0.15 + (h % 20) / 100)).toISOString();
  const qaAt = new Date(createdMs + span * (0.55 + (h % 15) / 100)).toISOString();
  const doneAt = input.resolutionDate;

  const transitions: LifecycleTransition[] = [
    { from: undefined, to: "To Do", at: todoAt },
  ];

  const status = input.status.toLowerCase();
  if (status.includes("to do") || status === "backlog" || status === "open") {
    return transitions;
  }

  transitions.push({ from: "To Do", to: "In Progress", at: inProgressAt });

  if (
    status.includes("test") ||
    status.includes("review") ||
    status.includes("qa") ||
    Boolean(doneAt)
  ) {
    transitions.push({
      from: "In Progress",
      to: status.includes("ready") ? "Ready for Testing" : "Testing",
      at: qaAt,
    });
  }

  if (doneAt) {
    const lastFrom =
      transitions[transitions.length - 1]?.to === "Testing" ||
      transitions[transitions.length - 1]?.to === "Ready for Testing"
        ? transitions[transitions.length - 1]!.to
        : "In Progress";
    transitions.push({ from: lastFrom, to: "Done", at: doneAt });
  } else if (
    !status.includes("test") &&
    !status.includes("progress") &&
    !status.includes("ready")
  ) {
    // Keep current named status as latest transition target.
    transitions.push({
      from: "In Progress",
      to: input.status,
      at: new Date(createdMs + span * 0.7).toISOString(),
    });
  }

  return transitions;
}

function riskItemsFromDerived(
  derived: OverviewDerivedPack,
  sprintId: string,
  teamKey?: string | null,
): ScheduleRiskItem[] {
  const sid = sprintId || derived.defaultSprintId;
  if (teamKey) {
    const scoped = derived.scheduleRiskByTeamSprint[`${teamKey}:${sid}`] as
      | { items?: ScheduleRiskItem[] }
      | undefined;
    if (scoped?.items?.length) return [...scoped.items];
  }
  const bySprint = derived.scheduleRiskBySprint[sid] as
    | { items?: ScheduleRiskItem[] }
    | undefined;
  return bySprint?.items ? [...bySprint.items] : [];
}

function buildOpenIssueFromRisk(
  item: ScheduleRiskItem,
  projectKey: string,
  siteUrl: string | undefined,
  nowIso: string,
  nowMs: number,
): LifecycleIssue {
  const h = hashKey(item.key);
  const ageDays = 3 + (h % 18);
  const created = daysAgoIso(nowMs, ageDays, h % 12);
  const transitions = synthesizeTransitions({
    key: item.key,
    status: item.status,
    created,
    nowIso,
  });
  const jiraUrl = siteUrl
    ? `${siteUrl.replace(/\/$/, "")}/browse/${item.key}`
    : undefined;

  return enrichLifecycleIssue(
    {
      key: item.key,
      summary: item.summary,
      issueType: item.summary.startsWith("[BE]")
        ? "Bug"
        : item.summary.startsWith("[FE]")
          ? "Bug"
          : "Story",
      status: item.status,
      priority: item.priority,
      projectKey,
      teamKey: item.teamKey,
      teamName: item.teamName,
      assignee: pickAssignee(item.teamKey, item.key),
      created,
      transitions,
      riskReason: item.reason,
      jiraUrl,
    },
    { nowIso },
  );
}

function buildResolvedIssues(
  projectKey: string,
  siteUrl: string | undefined,
  nowIso: string,
  nowMs: number,
  teamKey?: string | null,
  seedItems: ScheduleRiskItem[] = [],
): LifecycleIssue[] {
  const teams = teamKey
    ? [teamKey]
    : ["AVENGERS", "APEX", "DARK", "MOBILE"];
  const count = 36;
  const issues: LifecycleIssue[] = [];

  for (let i = 0; i < count; i++) {
    const team = teams[i % teams.length]!;
    const seed = seedItems[i % Math.max(seedItems.length, 1)];
    const key = `TP-D${9000 + i}`;
    const h = hashKey(key + team);
    const leadDays = 4 + (h % 20);
    const resolvedDaysAgo = 1 + (h % 28);
    const created = daysAgoIso(nowMs, resolvedDaysAgo + leadDays, h % 8);
    const resolutionDate = daysAgoIso(nowMs, resolvedDaysAgo, (h % 6) + 2);
    const summary =
      seed?.summary?.replace(/^\[(BE|FE)\]/, "[Done]") ??
      `Completed delivery work item ${i + 1}`;
    const transitions = synthesizeTransitions({
      key,
      status: "Done",
      created,
      resolutionDate,
      nowIso,
    });
    const jiraUrl = siteUrl
      ? `${siteUrl.replace(/\/$/, "")}/browse/${key}`
      : undefined;

    issues.push(
      enrichLifecycleIssue(
        {
          key,
          summary,
          issueType: h % 3 === 0 ? "Bug" : "Story",
          status: "Done",
          priority: h % 5 === 0 ? "High" : "Medium",
          projectKey,
          teamKey: team,
          teamName: team,
          assignee: pickAssignee(team, key),
          created,
          resolutionDate,
          transitions,
          jiraUrl,
        },
        { nowIso },
      ),
    );
  }
  return issues;
}

/**
 * Build a LifecycleSnapshot for mock Delivery from schedule-risk samples
 * plus synthesized resolved tickets (for cycle/lead/throughput).
 * Transitions are synthesized — labelled in the snapshot.
 */
export function buildMockLifecycleSnapshot(
  derived: OverviewDerivedPack,
  opts: {
    sprintId?: string | null;
    teamKey?: string | null;
    range?: TimeRange;
    nowIso?: string;
  } = {},
): LifecycleSnapshot {
  const nowIso = opts.nowIso ?? derived.lastSyncAt ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const sprintId = opts.sprintId || derived.defaultSprintId;
  const riskItems = riskItemsFromDerived(derived, sprintId, opts.teamKey);
  const openIssues = riskItems.map((item) =>
    buildOpenIssueFromRisk(
      item,
      derived.projectKey,
      derived.jiraSiteUrl,
      nowIso,
      nowMs,
    ),
  );
  const resolved = buildResolvedIssues(
    derived.projectKey,
    derived.jiraSiteUrl,
    nowIso,
    nowMs,
    opts.teamKey,
    riskItems,
  );

  const issues = [...openIssues, ...resolved];
  return buildLifecycleSnapshotFromIssues(issues, {
    range: opts.range ?? "30d",
    projectKey: derived.projectKey,
    siteUrl: derived.jiraSiteUrl,
    nowIso,
    sampleCapped: issues.length > 200,
    transitionsInferred: true,
    source: "mock",
  });
}
