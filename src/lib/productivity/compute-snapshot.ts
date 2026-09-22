import type { OverviewDerivedPack } from "@/lib/store/mock/overview-derived";
import { previousSprintId } from "@/lib/store/mock/overview-derived";
import type {
  ProductivityContributorMetrics,
  ProductivityDerivedPack,
  ProductivityPullRequest,
  ProductivityReviewEvent,
  ProductivityReviewLoadRow,
  ProductivitySnapshot,
  ProductivityTeamTotals,
  ProductivityThroughputPoint,
} from "@/lib/productivity/types";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function hoursBetween(startIso: string, endIso: string): number {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return (b - a) / (1000 * 60 * 60);
}

function delta(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null) return null;
  return current - prior;
}

function sprintLabel(derived: OverviewDerivedPack, sprintId: string): string {
  const s = derived.sprints.find((x) => x.id === sprintId);
  return s?.name ?? `Sprint ${sprintId}`;
}

function shortSprintLabel(derived: OverviewDerivedPack, sprintId: string): string {
  const s = derived.sprints.find((x) => x.id === sprintId);
  if (!s) return sprintId;
  const match = s.name.match(/(\d+)/);
  return match ? `S${match[1]}` : s.name;
}

function filterPrs(
  prs: ProductivityPullRequest[],
  teamKey: string | null,
  sprintId: string,
): ProductivityPullRequest[] {
  return prs.filter((pr) => {
    if (pr.sprintId !== sprintId) return false;
    if (teamKey && pr.teamKey !== teamKey) return false;
    return pr.mergedAt != null;
  });
}

function filterReviews(
  events: ProductivityReviewEvent[],
  teamKey: string | null,
  sprintId: string,
): ProductivityReviewEvent[] {
  return events.filter((e) => {
    if (e.sprintId !== sprintId) return false;
    if (teamKey && e.teamKey !== teamKey) return false;
    return true;
  });
}

function computeTotals(
  merged: ProductivityPullRequest[],
  reviews: ProductivityReviewEvent[],
  ticketRollup: {
    ticketsWorkedOn: number;
    storyPointsCompleted: number;
    ticketsSkipped: number;
    storyPointsSkipped: number;
  },
): Omit<
  ProductivityTeamTotals,
  | "prsMergedDelta"
  | "medianCycleHoursDelta"
  | "medianFirstReviewHoursDelta"
  | "reviewsGivenDelta"
> {
  const cycleHours = merged
    .filter((pr) => pr.mergedAt)
    .map((pr) => hoursBetween(pr.openedAt, pr.mergedAt!));
  const firstReviewHours = merged
    .filter((pr) => pr.firstReviewAt)
    .map((pr) => hoursBetween(pr.openedAt, pr.firstReviewAt!));

  return {
    prsMerged: merged.length,
    medianCycleHours: median(cycleHours),
    medianFirstReviewHours: median(firstReviewHours),
    reviewsGiven: reviews.length,
    ticketsWorkedOn: ticketRollup.ticketsWorkedOn,
    storyPointsCompleted: ticketRollup.storyPointsCompleted,
    ticketsSkipped: ticketRollup.ticketsSkipped,
    storyPointsSkipped: ticketRollup.storyPointsSkipped,
  };
}

function emptyTicketStats() {
  return {
    ticketsWorkedOn: 0,
    storyPointsCompleted: 0,
    ticketsSkipped: 0,
    storyPointsSkipped: 0,
  };
}

function rollupTicketStats(
  pack: ProductivityDerivedPack,
  teamKey: string | null,
  sprintId: string,
) {
  const rollup = emptyTicketStats();
  for (const contributor of pack.contributors) {
    if (teamKey && contributor.teamKey !== teamKey) continue;
    const stats =
      pack.ticketStatsByContributorSprint[contributor.id]?.[sprintId] ??
      emptyTicketStats();
    rollup.ticketsWorkedOn += stats.ticketsWorkedOn;
    rollup.storyPointsCompleted += stats.storyPointsCompleted;
    rollup.ticketsSkipped += stats.ticketsSkipped;
    rollup.storyPointsSkipped += stats.storyPointsSkipped;
  }
  return rollup;
}

function computeContributorMetrics(
  pack: ProductivityDerivedPack,
  teamKey: string | null,
  sprintId: string,
  merged: ProductivityPullRequest[],
  reviews: ProductivityReviewEvent[],
): ProductivityContributorMetrics[] {
  const contributors = pack.contributors.filter(
    (c) => !teamKey || c.teamKey === teamKey,
  );

  const metrics: ProductivityContributorMetrics[] = contributors.map((contributor) => {
    const authored = merged.filter((pr) => pr.authorId === contributor.id);
    const given = reviews.filter((e) => e.reviewerId === contributor.id);

    const cycleHours = authored
      .filter((pr) => pr.mergedAt)
      .map((pr) => hoursBetween(pr.openedAt, pr.mergedAt!));
    const firstReviewHours = authored
      .filter((pr) => pr.firstReviewAt)
      .map((pr) => hoursBetween(pr.openedAt, pr.firstReviewAt!));

    const linesAdded = authored.reduce((s, pr) => s + pr.additions, 0);
    const linesDeleted = authored.reduce((s, pr) => s + pr.deletions, 0);
    const unreviewedCount = authored.filter((pr) => pr.unreviewed).length;

    let aiGenerated = 0;
    let aiAssisted = 0;
    let humanOnly = 0;
    for (const pr of authored) {
      const lines = pr.additions + pr.deletions;
      if (pr.attribution === "ai_generated") aiGenerated += lines;
      else if (pr.attribution === "ai_assisted") aiAssisted += lines;
      else humanOnly += lines;
    }
    const totalLines = aiGenerated + aiAssisted + humanOnly;
    const aiShare = totalLines > 0 ? (aiGenerated + aiAssisted) / totalLines : 0;

    const issueKeys =
      pack.issuesResolvedByContributorSprint[contributor.id]?.[sprintId] ?? [];
    const ticketStats =
      pack.ticketStatsByContributorSprint[contributor.id]?.[sprintId] ??
      emptyTicketStats();

    return {
      contributor,
      rank: 0,
      prsMerged: authored.length,
      issuesResolved: issueKeys.length,
      ticketsWorkedOn: ticketStats.ticketsWorkedOn,
      storyPointsCompleted: ticketStats.storyPointsCompleted,
      ticketsSkipped: ticketStats.ticketsSkipped,
      storyPointsSkipped: ticketStats.storyPointsSkipped,
      medianCycleHours: median(cycleHours),
      medianFirstReviewHours: median(firstReviewHours),
      reviewsGiven: given.length,
      medianReviewTurnaroundHours: median(given.map((e) => e.turnaroundHours)),
      linesAdded,
      linesDeleted,
      linesNet: linesAdded - linesDeleted,
      unreviewedMergeRate: authored.length > 0 ? unreviewedCount / authored.length : 0,
      aiMix: { aiGenerated, aiAssisted, humanOnly },
      aiShare,
      pullRequestIds: authored.map((pr) => pr.id),
    };
  });

  metrics.sort((a, b) => {
    if (b.prsMerged !== a.prsMerged) return b.prsMerged - a.prsMerged;
    return a.contributor.displayName.localeCompare(b.contributor.displayName);
  });
  metrics.forEach((m, i) => {
    m.rank = i + 1;
  });

  return metrics;
}

function buildReviewLoad(
  contributors: ProductivityContributorMetrics[],
): { rows: ProductivityReviewLoadRow[]; caption: string | null } {
  const withReviews = contributors
    .filter((c) => c.reviewsGiven > 0)
    .sort((a, b) => b.reviewsGiven - a.reviewsGiven);

  const total = withReviews.reduce((s, c) => s + c.reviewsGiven, 0);
  const rows: ProductivityReviewLoadRow[] = withReviews.slice(0, 5).map((c) => {
    const first = c.contributor.displayName.split(" ")[0] ?? c.contributor.displayName;
    return {
      contributorId: c.contributor.id,
      displayName: c.contributor.displayName,
      shortName: first,
      reviewsGiven: c.reviewsGiven,
      sharePct: total > 0 ? Math.round((c.reviewsGiven / total) * 100) : 0,
    };
  });

  const top = rows[0];
  const caption =
    top && total > 0
      ? `One contributor handled ${top.sharePct}% of reviews this sprint.`
      : null;

  return { rows, caption };
}

function buildThroughputTrend(
  pack: ProductivityDerivedPack,
  derived: OverviewDerivedPack,
  teamKey: string | null,
): ProductivityThroughputPoint[] {
  // Oldest → newest for the chart
  const sprints = [...derived.sprints].reverse();
  return sprints.map((s) => {
    const count = pack.pullRequests.filter((pr) => {
      if (pr.sprintId !== s.id || !pr.mergedAt) return false;
      if (teamKey && pr.teamKey !== teamKey) return false;
      return true;
    }).length;
    return {
      sprintId: s.id,
      label: shortSprintLabel(derived, s.id),
      prsMerged: count,
    };
  });
}

/**
 * Aggregate a derived pack into a team+sprint snapshot.
 */
export function computeProductivitySnapshot(
  pack: ProductivityDerivedPack,
  derived: OverviewDerivedPack,
  filters: { team: string | null; sprint: string },
): ProductivitySnapshot {
  const { team, sprint } = filters;
  const merged = filterPrs(pack.pullRequests, team, sprint);
  const reviews = filterReviews(pack.reviewEvents, team, sprint);
  const priorId = previousSprintId(derived, sprint);
  const ticketRollup = rollupTicketStats(pack, team, sprint);

  const currentTotals = computeTotals(merged, reviews, ticketRollup);
  let priorTotals: ReturnType<typeof computeTotals> | null = null;
  if (priorId) {
    priorTotals = computeTotals(
      filterPrs(pack.pullRequests, team, priorId),
      filterReviews(pack.reviewEvents, team, priorId),
      rollupTicketStats(pack, team, priorId),
    );
  }

  const totals: ProductivityTeamTotals = {
    ...currentTotals,
    prsMergedDelta: priorTotals
      ? currentTotals.prsMerged - priorTotals.prsMerged
      : null,
    medianCycleHoursDelta: delta(
      currentTotals.medianCycleHours,
      priorTotals?.medianCycleHours ?? null,
    ),
    medianFirstReviewHoursDelta: delta(
      currentTotals.medianFirstReviewHours,
      priorTotals?.medianFirstReviewHours ?? null,
    ),
    reviewsGivenDelta: priorTotals
      ? currentTotals.reviewsGiven - priorTotals.reviewsGiven
      : null,
  };

  const contributors = computeContributorMetrics(
    pack,
    team,
    sprint,
    merged,
    reviews,
  );

  const pullRequestsById: Record<string, ProductivityPullRequest> = {};
  for (const pr of merged) {
    pullRequestsById[pr.id] = pr;
  }

  const { rows: reviewLoad, caption: reviewLoadCaption } =
    buildReviewLoad(contributors);

  const empty = merged.length === 0 && contributors.every((c) => c.prsMerged === 0);

  return {
    teamKey: team,
    sprintId: sprint,
    sprintLabel: sprintLabel(derived, sprint),
    totals,
    contributors,
    pullRequestsById,
    throughputTrend: buildThroughputTrend(pack, derived, team),
    reviewLoad,
    reviewLoadCaption,
    empty,
  };
}
