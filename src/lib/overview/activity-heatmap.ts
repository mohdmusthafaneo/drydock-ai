import { prisma } from "@/lib/prisma";

export type ActivityHeatmap = {
  rows: { label: string; cells: number[] }[];
  dayLabels: string[];
  rangeLabel: string;
};

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = startOfUtcDay(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function emptyBuckets(days: number, end: Date): Map<string, number> {
  const map = new Map<string, number>();
  const start = addUtcDays(end, -(days - 1));
  for (let i = 0; i < days; i++) {
    map.set(dayKey(addUtcDays(start, i)), 0);
  }
  return map;
}

function bump(map: Map<string, number>, date: Date | null | undefined) {
  if (!date) return;
  const key = dayKey(date);
  if (!map.has(key)) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Normalize raw counts to UI intensity 0–4. */
function normalizeCells(counts: number[]): number[] {
  const max = Math.max(0, ...counts);
  if (max <= 0) return counts.map(() => 0);
  return counts.map((n) => {
    if (n <= 0) return 0;
    const ratio = n / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  });
}

/**
 * Count activity events bucketed by UTC day for the last `days` (default 14).
 * Field names: CodeAnalysisCommit.committedAt, CodeAnalysisPullRequest.mergedAt,
 * TicketSnapshot.ticketUpdatedAt, DeploymentEvent.deployedAt.
 */
export async function computeActivityHeatmap(
  organizationId: string,
  days = 14,
): Promise<ActivityHeatmap> {
  const safeDays = Math.max(1, Math.min(90, Math.round(days)));
  const end = startOfUtcDay(new Date());
  const since = addUtcDays(end, -(safeDays - 1));

  const commitBuckets = emptyBuckets(safeDays, end);
  const prBuckets = emptyBuckets(safeDays, end);
  const jiraBuckets = emptyBuckets(safeDays, end);
  const deployBuckets = emptyBuckets(safeDays, end);

  try {
    const [commits, prs, tickets, deploys] = await Promise.all([
      prisma.codeAnalysisCommit.findMany({
        where: { organizationId, committedAt: { gte: since } },
        select: { committedAt: true },
      }),
      prisma.codeAnalysisPullRequest.findMany({
        where: { organizationId, mergedAt: { gte: since } },
        select: { mergedAt: true },
      }),
      prisma.ticketSnapshot.findMany({
        where: {
          organizationId,
          ticketUpdatedAt: { gte: since },
        },
        select: { ticketUpdatedAt: true },
      }),
      prisma.deploymentEvent.findMany({
        where: { organizationId, deployedAt: { gte: since } },
        select: { deployedAt: true },
      }),
    ]);

    for (const row of commits) bump(commitBuckets, row.committedAt);
    for (const row of prs) bump(prBuckets, row.mergedAt);
    for (const row of tickets) bump(jiraBuckets, row.ticketUpdatedAt);
    for (const row of deploys) bump(deployBuckets, row.deployedAt);
  } catch {
    // Missing tables / stale client — return empty heatmap rather than throw.
  }

  const orderedKeys = [...commitBuckets.keys()].sort();
  const dayLabels = orderedKeys.map((key) => dayLabel(new Date(`${key}T00:00:00.000Z`)));

  const rows = [
    {
      label: "Commits",
      cells: normalizeCells(orderedKeys.map((k) => commitBuckets.get(k) ?? 0)),
    },
    {
      label: "PRs",
      cells: normalizeCells(orderedKeys.map((k) => prBuckets.get(k) ?? 0)),
    },
    {
      label: "Jira updates",
      cells: normalizeCells(orderedKeys.map((k) => jiraBuckets.get(k) ?? 0)),
    },
    {
      label: "Deployments",
      cells: normalizeCells(orderedKeys.map((k) => deployBuckets.get(k) ?? 0)),
    },
  ];

  return {
    rows,
    dayLabels,
    rangeLabel: safeDays === 14 ? "Last 2 weeks" : `Last ${safeDays} days`,
  };
}
