import { z } from "zod";

// Helpers
const ymdToDateOrNull = (ymd: string): Date | null => {
  // parse as UTC midnight to keep date-only semantics stable
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00.000Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const weekdayKeys = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const hourKeyRegex = /^\d{2}:00$/;
const commitTypeEnum = z.enum([
  "feat",
  "fix",
  "ci",
  "docs",
  "chore",
  "refactor",
  "perf",
  "test",
  "merge",
  "other",
]);

export const analyzeGitReportSchema = z
  .object({
    report: z
      .object({
        title: z.string(),
        branch_analyzed: z.string(),
        comparison_branch: z.string().nullable(),
        window: z
          .object({
            first_commit: z.string(),
            last_commit: z.string(),
            calendar_days: z.number().int(),
            active_days: z.number().int(),
            active_iso_weeks: z.number().int(),
          })
          .passthrough(),
        data_source: z.string(),
        tl_dr: z.string(),
      })
      .passthrough(),

    headline: z.object({
      total_commits: z.number().int(),
      merge_commits: z.number().int(),
      non_merge_commits: z.number().int(),
      files_touched: z.number().int(),
      lines_added_raw: z.number().int(),
      lines_deleted_raw: z.number().int(),
      lines_added_product: z.number().int(),
      lines_deleted_product: z.number().int(),
      net_growth_raw: z.number().int(),
      net_growth_product: z.number().int(),
      prs_merged: z.number().int(),
      active_days: z.number().int(),
      calendar_days: z.number().int(),
      avg_commits_per_active_day: z.number(),
      avg_commits_per_calendar_day: z.number(),
      median_commit: z
        .object({
          added: z.number().int(),
          deleted: z.number().int(),
        })
        .passthrough(),
      mean_commit: z
        .object({
          added: z.number().int(),
          deleted: z.number().int(),
        })
        .passthrough(),
      p90_commit_added: z.number().int(),
      max_commit_added: z.number().int(),
      feat_fix_ratio: z.number(),
    }),

    contributors: z.array(
      z
        .object({
          author: z.string(),
          commits: z.number().int(),
          share_pct: z.number(),
          files: z.number().int(),
          lines_added: z.number().int(),
          lines_deleted: z.number().int(),
          net: z.number().int(),
        })
        .passthrough(),
    ),

    commit_type_breakdown: z.array(
      z
        .object({
          type: commitTypeEnum.or(z.string()),
          count: z.number().int(),
          share_pct: z.number(),
        })
        .passthrough(),
    ),

    weekly_volume: z.array(
      z
        .object({
          iso_week: z.string(),
          commits: z.number().int(),
        })
        .passthrough(),
    ),

    weekday_distribution: z
      .object({
        Mon: z.number().int(),
        Tue: z.number().int(),
        Wed: z.number().int(),
        Thu: z.number().int(),
        Fri: z.number().int(),
        Sat: z.number().int(),
        Sun: z.number().int(),
      })
      .passthrough(),

    hour_distribution_ist: z
      .record(z.string().regex(hourKeyRegex), z.number().int())
      .optional()
      .default({}),

    productivity_by_area: z.array(
      z
        .object({
          area: z.string(),
          commits: z.number().int(),
          files: z.number().int(),
          added: z.number().int(),
          deleted: z.number().int(),
          net: z.number().int(),
        })
        .passthrough(),
    ),

    largest_commits: z.array(
      z
        .object({
          sha: z.string(),
          date: z.string(),
          author: z.string(),
          subject: z.string(),
          files: z.number().int(),
          added: z.number().int(),
          deleted: z.number().int(),
        })
        .passthrough(),
    ),

    commit_size_distribution_added_lines: z.array(
      z
        .object({
          bucket: z.string(),
          count: z.number().int(),
        })
        .passthrough(),
    ),

    branching_and_delivery: z
      .object({
        dev_ahead_of_main_commits: z.number().int(),
        main_ahead_of_dev_commits: z.number().int(),
        prs_merged: z.number().int(),
        remote_branch_count: z.number().int(),
        remote_branches: z.array(z.string()),
      })
      .passthrough(),

    what_went_well: z.array(z.string()),

    risks: z
      .array(
        z.union([
          z.string(),
          z
            .object({
              title: z.string(),
              detail: z.string().optional(),
            })
            .passthrough(),
        ]),
      ),

    recommendations: z
      .array(
        z.union([
          z.string(),
          z
            .object({
              title: z.string(),
              detail: z.string().optional(),
            })
            .passthrough(),
        ]),
      ),

    methodology_and_caveats: z
      .object({
        data_source: z.string(),
        exclusions: z
          .object({
            noisy_files: z.string(),
            generated_dirs: z.string(),
          })
          .passthrough(),
        loc_note: z.string(),
        strongest_signals: z.array(z.string()),
        weakest_signals: z.array(z.string()),
      })
      .passthrough(),
  })
  .passthrough();

export type AnalyzeGitReport = z.infer<typeof analyzeGitReportSchema>;

export type PersistRunContext = {
  repositoryName: string;
  repositoryUrl?: string;
  branch: string;

  reportPath: string;
  reportSha256: string;

  mastraTraceId?: string;
  mastraThreadId?: string;
  mastraRunId?: string;
};

export function mapReportToRows(report: AnalyzeGitReport, ctx: PersistRunContext) {
  const { headline } = report;

  const run = {
    repositoryName: ctx.repositoryName,
    repositoryUrl: ctx.repositoryUrl ?? null,
    branch: ctx.branch,
    reportPath: ctx.reportPath,
    reportSha256: ctx.reportSha256,
    mastraRunId: ctx.mastraRunId ?? null,
    mastraTraceId: ctx.mastraTraceId ?? null,
    mastraThreadId: ctx.mastraThreadId ?? null,

    status: "PERSISTED" as const,

    windowFirstCommit: ymdToDateOrNull(report.report.window.first_commit),
    windowLastCommit: ymdToDateOrNull(report.report.window.last_commit),
    windowCalendarDays: report.report.window.calendar_days,
    windowActiveDays: report.report.window.active_days,
    windowActiveIsoWeeks: report.report.window.active_iso_weeks,

    headlineTotalCommits: headline.total_commits,
    headlineMergeCommits: headline.merge_commits,
    headlineNonMergeCommits: headline.non_merge_commits,
    headlineFilesTouched: headline.files_touched,
    headlineLinesAddedRaw: headline.lines_added_raw,
    headlineLinesDeletedRaw: headline.lines_deleted_raw,
    headlineLinesAddedProduct: headline.lines_added_product,
    headlineLinesDeletedProduct: headline.lines_deleted_product,
    headlineNetGrowthRaw: headline.net_growth_raw,
    headlineNetGrowthProduct: headline.net_growth_product,
    headlinePrsMerged: headline.prs_merged,

    headlineActiveDays: headline.active_days,
    headlineCalendarDays: headline.calendar_days,
    headlineAvgCommitsPerActiveDay: headline.avg_commits_per_active_day,
    headlineAvgCommitsPerCalendarDay: headline.avg_commits_per_calendar_day,

    headlineMedianCommitAdded: headline.median_commit.added,
    headlineMedianCommitDeleted: headline.median_commit.deleted,
    headlineMeanCommitAdded: headline.mean_commit.added,
    headlineMeanCommitDeleted: headline.mean_commit.deleted,
    headlineP90CommitAdded: headline.p90_commit_added,
    headlineMaxCommitAdded: headline.max_commit_added,
    headlineFeatFixRatio: headline.feat_fix_ratio,

    strongestSignals: report.methodology_and_caveats.strongest_signals,
    weakestSignals: report.methodology_and_caveats.weakest_signals,
    remoteBranches: report.branching_and_delivery.remote_branches,

    devAheadOfMainCommits: report.branching_and_delivery.dev_ahead_of_main_commits,
    mainAheadOfDevCommits: report.branching_and_delivery.main_ahead_of_dev_commits,
    remoteBranchCount: report.branching_and_delivery.remote_branch_count,

    tlDr: report.report.tl_dr ?? "",
    methodologyDataSource: report.methodology_and_caveats.data_source,
    methodologyLocNote: report.methodology_and_caveats.loc_note,
    methodologyExclusionsNoisyFiles:
      report.methodology_and_caveats.exclusions.noisy_files,
    methodologyExclusionsGeneratedDirs:
      report.methodology_and_caveats.exclusions.generated_dirs,
  };

  const contributors = report.contributors.map((c, i) => ({
    authorName: c.author,
    commits: c.commits,
    sharePct: c.share_pct,
    files: c.files,
    linesAdded: c.lines_added,
    linesDeleted: c.lines_deleted,
    net: c.net,
    rank: i + 1,
  }));

  const commitTypes = report.commit_type_breakdown.map((t, i) => ({
    commitType: t.type,
    count: t.count,
    sharePct: t.share_pct,
    // rank not needed for now; derived at query time if desired
  }));

  const weeklyVolume = report.weekly_volume.map((w) => ({
    isoWeek: w.iso_week,
    commits: w.commits,
  }));

  const activityBuckets: Array<{
    dimension: "WEEKDAY" | "HOUR_IST" | "COMMIT_SIZE_ADDED";
    bucketKey: string;
    bucketIndex: number;
    commits: number;
  }> = [];

  // WEEKDAY distribution sums to TOTAL commits in the script (includes merges).
  weekdayKeys.forEach((k, i) => {
    activityBuckets.push({
      dimension: "WEEKDAY",
      bucketKey: k,
      bucketIndex: i,
      commits: report.weekday_distribution[k],
    });
  });

  // HOUR_IST distribution sums to NON-MERGE commits in the script (merges excluded when include_merges is false).
  const hourDist = report.hour_distribution_ist ?? {};
  for (const [key, value] of Object.entries(hourDist)) {
    const hour = Number.parseInt(key.slice(0, 2), 10);
    activityBuckets.push({
      dimension: "HOUR_IST",
      bucketKey: key,
      bucketIndex: Number.isNaN(hour) ? 0 : hour,
      commits: value,
    });
  }
  activityBuckets
    .filter((b) => b.dimension === "HOUR_IST")
    .sort((a, b) => a.bucketIndex - b.bucketIndex);

  // commit size distribution sums to NON-MERGE commits.
  report.commit_size_distribution_added_lines.forEach((b, i) => {
    activityBuckets.push({
      dimension: "COMMIT_SIZE_ADDED",
      bucketKey: b.bucket,
      bucketIndex: i,
      commits: b.count,
    });
  });

  const areaStats = report.productivity_by_area.map((a, i) => ({
    area: a.area,
    commits: a.commits,
    files: a.files,
    added: a.added,
    deleted: a.deleted,
    net: a.net,
    rank: i + 1,
  }));

  const largeCommits = report.largest_commits.map((c, i) => ({
    sha: c.sha,
    committedOn: ymdToDateOrNull(c.date),
    authorName: c.author,
    subject: c.subject,
    files: c.files,
    added: c.added,
    deleted: c.deleted,
    rank: i + 1,
  }));

  const insights: Array<{
    kind: "WENT_WELL" | "RISK" | "RECOMMENDATION";
    title: string;
    detail: string;
    rank: number;
  }> = [];

  report.what_went_well.forEach((s, i) => {
    insights.push({
      kind: "WENT_WELL",
      title: s,
      detail: "",
      rank: i + 1,
    });
  });

  const normalizeInsightItem = (item: unknown) => {
    if (typeof item === "string") return { title: item, detail: "" };
    if (!item || typeof item !== "object") return { title: String(item), detail: "" };
    const rec = item as Record<string, unknown>;
    return {
      title: rec.title != null ? String(rec.title) : "",
      detail: rec.detail != null ? String(rec.detail) : "",
    };
  };

  report.risks.forEach((r, i) => {
    const n = normalizeInsightItem(r);
    insights.push({
      kind: "RISK",
      title: n.title,
      detail: n.detail,
      rank: i + 1,
    });
  });

  report.recommendations.forEach((r, i) => {
    const n = normalizeInsightItem(r);
    insights.push({
      kind: "RECOMMENDATION",
      title: n.title,
      detail: n.detail,
      rank: i + 1,
    });
  });

  return {
    run,
    contributors,
    commitTypes,
    weeklyVolume,
    activityBuckets,
    areaStats,
    largeCommits,
    insights,
  };
}

