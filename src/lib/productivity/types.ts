/**
 * Productivity domain types — per-contributor delivery metrics for `/productivity`.
 * Person-dimension carve-out: see docs/DRYDOCK-CONCEPT.md §12.
 */

export type AiAttribution = "ai_generated" | "ai_assisted" | "human_only";

export type Contributor = {
  id: string;
  displayName: string;
  githubHandle: string;
  jiraName: string;
  teamKey: string;
  avatarInitials: string;
};

export type ProductivityPullRequest = {
  id: string;
  number: number;
  title: string;
  url: string;
  repo: string;
  authorId: string;
  teamKey: string;
  sprintId: string;
  openedAt: string;
  firstReviewAt: string | null;
  mergedAt: string | null;
  reviewerIds: string[];
  additions: number;
  deletions: number;
  attribution: AiAttribution;
  jiraKeys: string[];
  /** True when merged with zero reviews. */
  unreviewed: boolean;
};

export type ProductivityReviewEvent = {
  id: string;
  pullRequestId: string;
  reviewerId: string;
  teamKey: string;
  sprintId: string;
  /** When the review was submitted. */
  reviewedAt: string;
  /** Hours from PR open (or prior review request) to this review. */
  turnaroundHours: number;
};

/** Per-contributor Jira ticket activity for one sprint. */
export type ProductivityTicketSprintStats = {
  /** Tickets assigned / touched in the sprint (done + in-progress + skipped). */
  ticketsWorkedOn: number;
  /** Story points on tickets completed (Done) in the sprint. */
  storyPointsCompleted: number;
  /** Tickets planned but not completed (spillover / deferred / removed). */
  ticketsSkipped: number;
  /** Story points on skipped tickets. */
  storyPointsSkipped: number;
};

export type ProductivityContributorMetrics = {
  contributor: Contributor;
  rank: number;
  prsMerged: number;
  issuesResolved: number;
  ticketsWorkedOn: number;
  storyPointsCompleted: number;
  ticketsSkipped: number;
  storyPointsSkipped: number;
  /** Median hours open → merge; null if no merged PRs. */
  medianCycleHours: number | null;
  /** Median hours open → first review; null if none. */
  medianFirstReviewHours: number | null;
  reviewsGiven: number;
  /** Median review turnaround hours; null if no reviews given. */
  medianReviewTurnaroundHours: number | null;
  linesAdded: number;
  linesDeleted: number;
  linesNet: number;
  /** Share of this contributor's merged PRs that had no review (0–1). */
  unreviewedMergeRate: number;
  aiMix: {
    aiGenerated: number;
    aiAssisted: number;
    humanOnly: number;
  };
  /** Share of lines attributed to AI (generated + assisted), 0–1. */
  aiShare: number;
  pullRequestIds: string[];
};

export type ProductivityTeamTotals = {
  prsMerged: number;
  prsMergedDelta: number | null;
  medianCycleHours: number | null;
  medianCycleHoursDelta: number | null;
  medianFirstReviewHours: number | null;
  medianFirstReviewHoursDelta: number | null;
  reviewsGiven: number;
  reviewsGivenDelta: number | null;
  ticketsWorkedOn: number;
  storyPointsCompleted: number;
  ticketsSkipped: number;
  storyPointsSkipped: number;
};

export type ProductivityThroughputPoint = {
  sprintId: string;
  label: string;
  prsMerged: number;
};

export type ProductivityReviewLoadRow = {
  contributorId: string;
  displayName: string;
  shortName: string;
  reviewsGiven: number;
  sharePct: number;
};

export type ProductivitySnapshot = {
  teamKey: string | null;
  sprintId: string;
  sprintLabel: string;
  totals: ProductivityTeamTotals;
  contributors: ProductivityContributorMetrics[];
  /** PRs in scope for drill-down (keyed by id). */
  pullRequestsById: Record<string, ProductivityPullRequest>;
  throughputTrend: ProductivityThroughputPoint[];
  reviewLoad: ProductivityReviewLoadRow[];
  /** Caption for review-load concentration, e.g. top share. */
  reviewLoadCaption: string | null;
  empty: boolean;
};

export type ProductivityFilters = {
  team: string | null;
  sprint: string | null;
};

/** Raw derived pack emitted by the mock generator (before aggregation). */
export type ProductivityDerivedPack = {
  orgKey: "tpt" | "connexus";
  projectKey: string;
  contributors: Contributor[];
  pullRequests: ProductivityPullRequest[];
  reviewEvents: ProductivityReviewEvent[];
  /** Distinct Jira issue keys resolved per contributor id (across all sprints). */
  issuesResolvedByContributor: Record<string, string[]>;
  /** Issues resolved per contributor per sprint: contributorId → sprintId → keys. */
  issuesResolvedByContributorSprint: Record<string, Record<string, string[]>>;
  /**
   * Ticket + story-point activity per contributor per sprint.
   * contributorId → sprintId → stats.
   */
  ticketStatsByContributorSprint: Record<
    string,
    Record<string, ProductivityTicketSprintStats>
  >;
};
