import type { TimeRange } from "@/lib/delivery-analysis/types";
import type {
  LifecycleIssue,
  LifecycleIssueSampleStored,
  LifecycleKpis,
  LifecyclePersonRow,
  LifecycleSnapshot,
  LifecycleStageRow,
  LifecycleStatusCategory,
  LifecycleTransition,
} from "@/lib/delivery-analysis/lifecycle-types";

export const AGING_WIP_THRESHOLD_DAYS = 7;
export const LIFECYCLE_ISSUE_CAP = 200;

const QA_STATUS_RE =
  /\b(qa|test|testing|ready for test|ready for testing|in review|code review|peer review)\b/i;
const BLOCKED_STATUS_RE = /\b(blocked|impediment|waiting|on hold)\b/i;
const DONE_STATUS_RE = /\b(done|closed|resolved|complete|completed|cancelled|canceled)\b/i;
const TODO_STATUS_RE = /\b(to do|todo|backlog|open|selected for development|new)\b/i;
const IN_PROGRESS_STATUS_RE =
  /\b(in progress|in development|developing|coding|doing|active|wip)\b/i;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

export function hoursBetween(startIso: string, endIso: string): number | null {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / (1000 * 60 * 60);
}

export function categorizeStatus(
  status: string,
  doneStatusNames: string[] = [],
  blockedStatusName?: string,
): LifecycleStatusCategory {
  const normalized = status.trim().toLowerCase();
  if (
    blockedStatusName &&
    normalized === blockedStatusName.trim().toLowerCase()
  ) {
    return "blocked";
  }
  if (doneStatusNames.some((n) => n.trim().toLowerCase() === normalized)) {
    return "done";
  }
  if (BLOCKED_STATUS_RE.test(status)) return "blocked";
  if (DONE_STATUS_RE.test(status)) return "done";
  if (QA_STATUS_RE.test(status)) return "qa";
  if (TODO_STATUS_RE.test(status)) return "todo";
  if (IN_PROGRESS_STATUS_RE.test(status)) return "inProgress";
  return "other";
}

/** First timestamp the issue entered an in-progress-like status. */
export function firstInProgressAt(
  transitions: LifecycleTransition[],
  created?: string,
  doneStatusNames: string[] = [],
  blockedStatusName?: string,
): string | null {
  const sorted = [...transitions].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  for (const t of sorted) {
    const cat = categorizeStatus(t.to, doneStatusNames, blockedStatusName);
    if (cat === "inProgress" || cat === "qa") return t.at;
  }
  // Fallback: if created and first transition leaves todo, use that transition.
  if (sorted[0] && created) {
    const fromCat = sorted[0].from
      ? categorizeStatus(sorted[0].from, doneStatusNames, blockedStatusName)
      : "todo";
    const toCat = categorizeStatus(
      sorted[0].to,
      doneStatusNames,
      blockedStatusName,
    );
    if (fromCat === "todo" && toCat !== "todo" && toCat !== "done") {
      return sorted[0].at;
    }
  }
  return null;
}

export function doneAt(
  issue: {
    resolutionDate?: string;
    status: string;
    transitions: LifecycleTransition[];
  },
  doneStatusNames: string[] = [],
  blockedStatusName?: string,
): string | null {
  if (issue.resolutionDate) return issue.resolutionDate;
  const cat = categorizeStatus(
    issue.status,
    doneStatusNames,
    blockedStatusName,
  );
  if (cat !== "done") return null;
  const sorted = [...issue.transitions].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  for (let i = sorted.length - 1; i >= 0; i--) {
    const t = sorted[i]!;
    if (categorizeStatus(t.to, doneStatusNames, blockedStatusName) === "done") {
      return t.at;
    }
  }
  return null;
}

export function computeTimeInStatusHours(
  transitions: LifecycleTransition[],
  created?: string,
  nowIso: string = new Date().toISOString(),
): Record<string, number> {
  const hours: Record<string, number> = {};
  if (transitions.length === 0) return hours;

  const sorted = [...transitions].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );

  // Time before first transition in the initial status (from of first, or unknown).
  if (created && sorted[0]?.from) {
    const h = hoursBetween(created, sorted[0].at);
    if (h != null) {
      hours[sorted[0].from] = (hours[sorted[0].from] ?? 0) + h;
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const nextAt = sorted[i + 1]?.at ?? nowIso;
    const h = hoursBetween(cur.at, nextAt);
    if (h == null) continue;
    hours[cur.to] = (hours[cur.to] ?? 0) + h;
  }
  return hours;
}

export function enrichLifecycleIssue(
  input: {
    key: string;
    summary: string;
    issueType: string;
    status: string;
    priority: string;
    projectKey: string;
    teamKey?: string;
    teamName?: string;
    assignee?: string;
    created?: string;
    resolutionDate?: string;
    dueDate?: string;
    storyPoints?: number;
    transitions: LifecycleTransition[];
    riskReason?: string;
    jiraUrl?: string;
  },
  opts: {
    nowIso?: string;
    doneStatusNames?: string[];
    blockedStatusName?: string;
  } = {},
): LifecycleIssue {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const doneStatusNames = opts.doneStatusNames ?? [];
  const blockedStatusName = opts.blockedStatusName;
  const created = input.created ?? nowIso;
  const statusCategory = categorizeStatus(
    input.status,
    doneStatusNames,
    blockedStatusName,
  );
  const resolvedAt = doneAt(
    {
      resolutionDate: input.resolutionDate,
      status: input.status,
      transitions: input.transitions,
    },
    doneStatusNames,
    blockedStatusName,
  );
  const metricGaps: string[] = [];

  let leadHours: number | null = null;
  if (resolvedAt) {
    leadHours = hoursBetween(created, resolvedAt);
    if (leadHours == null) metricGaps.push("Lead time unavailable (invalid dates)");
  } else if (statusCategory !== "done") {
    metricGaps.push("Lead time unavailable (not resolved)");
  }

  let cycleHours: number | null = null;
  if (resolvedAt) {
    const start = firstInProgressAt(
      input.transitions,
      created,
      doneStatusNames,
      blockedStatusName,
    );
    if (!start) {
      metricGaps.push("Cycle time unavailable (no In Progress transition)");
    } else {
      cycleHours = hoursBetween(start, resolvedAt);
      if (cycleHours == null) {
        metricGaps.push("Cycle time unavailable (invalid dates)");
      }
    }
  }

  let ageHours: number | null = null;
  if (statusCategory !== "done") {
    const sorted = [...input.transitions].sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at),
    );
    const lastAt = sorted[sorted.length - 1]?.at ?? created;
    ageHours = hoursBetween(lastAt, nowIso);
  }

  return {
    key: input.key,
    summary: input.summary,
    issueType: input.issueType,
    status: input.status,
    statusCategory,
    priority: input.priority,
    projectKey: input.projectKey,
    teamKey: input.teamKey,
    teamName: input.teamName,
    assignee: input.assignee,
    created,
    resolutionDate: input.resolutionDate,
    dueDate: input.dueDate,
    storyPoints: input.storyPoints,
    transitions: input.transitions,
    leadHours,
    cycleHours,
    ageHours,
    timeInStatusHours: computeTimeInStatusHours(
      input.transitions,
      created,
      nowIso,
    ),
    metricGaps: metricGaps.length > 0 ? metricGaps : undefined,
    riskReason: input.riskReason,
    jiraUrl: input.jiraUrl,
  };
}

function rangeStartIso(range: TimeRange, nowIso: string): string {
  const now = Date.parse(nowIso);
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function rangeLabel(range: TimeRange): string {
  return range === "7d" ? "Last 7 days" : range === "90d" ? "Last 90 days" : "Last 30 days";
}

export function buildStageRows(issues: LifecycleIssue[]): LifecycleStageRow[] {
  const byStatus = new Map<
    string,
    { category: LifecycleStatusCategory; hours: number[]; count: number }
  >();

  for (const issue of issues) {
    const entry = byStatus.get(issue.status) ?? {
      category: issue.statusCategory,
      hours: [],
      count: 0,
    };
    entry.count += 1;
    const h = issue.timeInStatusHours[issue.status];
    if (h != null && h > 0) entry.hours.push(h);
    byStatus.set(issue.status, entry);
  }

  return [...byStatus.entries()]
    .map(([status, v]) => ({
      status,
      category: v.category,
      count: v.count,
      medianHours: median(v.hours),
    }))
    .sort((a, b) => b.count - a.count);
}

export function buildPersonRows(
  issues: LifecycleIssue[],
  rangeStart: string,
  agingThresholdDays: number,
): LifecyclePersonRow[] {
  const byPerson = new Map<string, LifecycleIssue[]>();
  for (const issue of issues) {
    const name = issue.assignee?.trim() || "Unassigned";
    const list = byPerson.get(name) ?? [];
    list.push(issue);
    byPerson.set(name, list);
  }

  const agingHours = agingThresholdDays * 24;
  const rows: LifecyclePersonRow[] = [];

  for (const [assignee, list] of byPerson) {
    const open = list.filter((i) => i.statusCategory !== "done");
    const stale = open.filter(
      (i) => i.ageHours != null && i.ageHours >= agingHours,
    );
    const throughput = list.filter(
      (i) =>
        i.resolutionDate &&
        Date.parse(i.resolutionDate) >= Date.parse(rangeStart),
    ).length;
    const cycleHours = list
      .map((i) => i.cycleHours)
      .filter((h): h is number => h != null);
    const leadHours = list
      .map((i) => i.leadHours)
      .filter((h): h is number => h != null);
    const ageHours = open
      .map((i) => i.ageHours)
      .filter((h): h is number => h != null);

    rows.push({
      assignee,
      openWip: open.length,
      staleCount: stale.length,
      throughput,
      medianCycleHours: median(cycleHours),
      medianLeadHours: median(leadHours),
      medianAgeHours: median(ageHours),
    });
  }

  return rows.sort((a, b) => b.openWip - a.openWip || b.throughput - a.throughput);
}

export function buildLifecycleKpis(
  issues: LifecycleIssue[],
  opts: {
    range: TimeRange;
    nowIso: string;
    sampleCapped: boolean;
    agingThresholdDays?: number;
  },
): LifecycleKpis {
  const agingThresholdDays =
    opts.agingThresholdDays ?? AGING_WIP_THRESHOLD_DAYS;
  const rangeStart = rangeStartIso(opts.range, opts.nowIso);
  const agingHours = agingThresholdDays * 24;

  const cycleHours = issues
    .map((i) => i.cycleHours)
    .filter((h): h is number => h != null);
  const leadHours = issues
    .map((i) => i.leadHours)
    .filter((h): h is number => h != null);

  const open = issues.filter((i) => i.statusCategory !== "done");
  const aging = open.filter(
    (i) => i.ageHours != null && i.ageHours >= agingHours,
  );
  const throughput = issues.filter(
    (i) =>
      i.resolutionDate &&
      Date.parse(i.resolutionDate) >= Date.parse(rangeStart),
  ).length;

  return {
    medianCycleHours: median(cycleHours),
    medianLeadHours: median(leadHours),
    throughput,
    currentWip: open.filter(
      (i) =>
        i.statusCategory === "inProgress" ||
        i.statusCategory === "qa" ||
        i.statusCategory === "blocked",
    ).length,
    agingWipCount: aging.length,
    agingWipPct:
      open.length > 0 ? Math.round((aging.length / open.length) * 100) : null,
    agingThresholdDays,
    sampleSize: issues.length,
    sampleCapped: opts.sampleCapped,
    rangeLabel: rangeLabel(opts.range),
  };
}

export function buildLifecycleSnapshotFromIssues(
  issues: LifecycleIssue[],
  opts: {
    range: TimeRange;
    projectKey: string | null;
    siteUrl?: string;
    nowIso?: string;
    sampleCapped?: boolean;
    transitionsInferred?: boolean;
    source: LifecycleSnapshot["source"];
    unavailableReason?: string;
  },
): LifecycleSnapshot {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const capped = issues.slice(0, LIFECYCLE_ISSUE_CAP);
  const sampleCapped =
    Boolean(opts.sampleCapped) || issues.length > LIFECYCLE_ISSUE_CAP;
  const rangeStart = rangeStartIso(opts.range, nowIso);

  return {
    generatedAt: nowIso,
    range: opts.range,
    projectKey: opts.projectKey,
    siteUrl: opts.siteUrl,
    kpis: buildLifecycleKpis(capped, {
      range: opts.range,
      nowIso,
      sampleCapped,
    }),
    stageRows: buildStageRows(capped),
    issues: capped,
    byPerson: buildPersonRows(capped, rangeStart, AGING_WIP_THRESHOLD_DAYS),
    transitionsInferred: opts.transitionsInferred,
    source: opts.source,
    unavailableReason: opts.unavailableReason,
  };
}

/** Map a persisted Jira sample into LifecycleIssue rows. */
export function issuesFromStoredSample(
  sample: LifecycleIssueSampleStored,
  opts: {
    siteUrl?: string;
    nowIso?: string;
    doneStatusNames?: string[];
    blockedStatusName?: string;
    teamKey?: string | null;
  } = {},
): LifecycleIssue[] {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  return sample.issues.map((raw) => {
    const jiraUrl = opts.siteUrl
      ? `${opts.siteUrl.replace(/\/$/, "")}/browse/${raw.key}`
      : undefined;
    return enrichLifecycleIssue(
      {
        key: raw.key,
        summary: raw.summary ?? raw.key,
        issueType: raw.issueType,
        status: raw.status,
        priority: raw.priority ?? "Medium",
        projectKey: sample.projectKey,
        assignee: raw.assignee,
        created: raw.created,
        resolutionDate: raw.resolutionDate,
        dueDate: raw.dueDate,
        transitions: raw.transitions,
        jiraUrl,
      },
      {
        nowIso,
        doneStatusNames: opts.doneStatusNames,
        blockedStatusName: opts.blockedStatusName,
      },
    );
  });
}
