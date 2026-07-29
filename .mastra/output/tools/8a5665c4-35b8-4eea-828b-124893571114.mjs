import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { f as forOrg, p as prisma } from '../prisma.mjs';
import { r as resolveOrganizationId } from '../request-context.mjs';
import '@prisma/adapter-pg';
import 'pg';
import 'node:path';
import 'node:url';
import '@prisma/client/runtime/client';

const verifyProductivityReportTool = createTool({
  id: "verify-productivity-report",
  description: "Re-query a persisted ProductivityAnalysisRun and validate normalized row integrity against the analyzer's headline totals. Marks the run VERIFIED or FAILED.",
  inputSchema: z.object({
    run_id: z.string().min(1),
    organizationId: z.string().optional()
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    runId: z.string(),
    status: z.enum(["VERIFIED", "FAILED"]),
    failedChecks: z.array(z.string()),
    rowCounts: z.object({
      contributors: z.number(),
      commitTypes: z.number(),
      weeklyVolume: z.number(),
      activityBuckets: z.number(),
      largeCommits: z.number(),
      insights: z.number()
    }),
    checks: z.array(
      z.object({
        name: z.string(),
        expected: z.any(),
        actual: z.any(),
        pass: z.boolean()
      })
    )
  }),
  toModelOutput: (output) => {
    const failed = output.checks.filter((c) => !c.pass);
    const failedNames = failed.slice(0, 5).map((c) => c.name).join(", ");
    return {
      type: "text",
      value: `Verification ${output.ok ? "passed" : "failed"} for runId=${output.runId} (${output.status}).${failedNames ? ` Failed checks: ${failedNames}` : ""}`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to verify productivity analysis. Provide it via RequestContext or as verifyProductivityReportTool.organizationId."
      );
    }
    const db = forOrg(organizationId);
    const run = await db.productivityAnalysisRun.findFirst({
      where: { id: inputData.run_id }
    });
    if (!run) {
      throw new Error(
        `No ProductivityAnalysisRun found for run_id=${inputData.run_id} in organizationId=${organizationId}`
      );
    }
    const runId = run.id;
    const expectedNonMerge = run.headlineNonMergeCommits ?? 0;
    const expectedTotal = run.headlineTotalCommits ?? 0;
    const contributorAgg = await db.productivityContributorStat.aggregate({
      where: { runId },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const contributorsSumCommits = contributorAgg._sum.commits ?? 0;
    const contributorsCount = contributorAgg._count._all;
    const commitTypeAgg = await db.productivityCommitTypeStat.aggregate({
      where: { runId },
      _sum: { count: true },
      _count: { _all: true }
    });
    const commitTypesSumCount = commitTypeAgg._sum.count ?? 0;
    const commitTypesCount = commitTypeAgg._count._all;
    const weeklyAgg = await db.productivityWeeklyVolume.aggregate({
      where: { runId },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const weeklySumCommits = weeklyAgg._sum.commits ?? 0;
    const weeklyVolumeCount = weeklyAgg._count._all;
    const activityAggAll = await db.productivityActivityBucket.aggregate({
      where: { runId },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const activityBucketsCount = activityAggAll._count._all;
    const activityWeekdayAgg = await db.productivityActivityBucket.aggregate({
      where: { runId, dimension: "WEEKDAY" },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const weekdaySumCommits = activityWeekdayAgg._sum.commits ?? 0;
    const activityHourAgg = await db.productivityActivityBucket.aggregate({
      where: { runId, dimension: "HOUR_IST" },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const hourSumCommits = activityHourAgg._sum.commits ?? 0;
    const hourBucketsCount = activityHourAgg._count._all;
    const activityCommitSizeAgg = await db.productivityActivityBucket.aggregate({
      where: { runId, dimension: "COMMIT_SIZE_ADDED" },
      _sum: { commits: true },
      _count: { _all: true }
    });
    const commitSizeSumCommits = activityCommitSizeAgg._sum.commits ?? 0;
    const largeCommitsCount = await db.productivityLargeCommit.count({ where: { runId } });
    const insightsCount = await db.productivityInsight.count({ where: { runId } });
    const checks = [];
    const addCheck = (name, expected, actual, pass) => {
      checks.push({ name, expected, actual, pass });
    };
    addCheck(
      "sum(contributors.commits)==nonMergeCommits",
      expectedNonMerge,
      contributorsSumCommits,
      contributorsSumCommits === expectedNonMerge
    );
    addCheck(
      "sum(commitTypes.count)==nonMergeCommits",
      expectedNonMerge,
      commitTypesSumCount,
      commitTypesSumCount === expectedNonMerge
    );
    addCheck(
      "sum(weeklyVolume.commits)==totalCommits",
      expectedTotal,
      weeklySumCommits,
      weeklySumCommits === expectedTotal
    );
    addCheck(
      "sum(activityBuckets(WEEKDAY).commits)==totalCommits",
      expectedTotal,
      weekdaySumCommits,
      weekdaySumCommits === expectedTotal
    );
    addCheck(
      "sum(activityBuckets(HOUR_IST).commits)==nonMergeCommits",
      expectedNonMerge,
      hourSumCommits,
      hourSumCommits === expectedNonMerge
    );
    addCheck(
      "sum(activityBuckets(COMMIT_SIZE_ADDED).commits)==nonMergeCommits",
      expectedNonMerge,
      commitSizeSumCommits,
      commitSizeSumCommits === expectedNonMerge
    );
    addCheck(
      "contributors>0",
      true,
      contributorsCount,
      contributorsCount > 0
    );
    addCheck(
      "largeCommits<=15",
      true,
      largeCommitsCount,
      largeCommitsCount <= 15
    );
    addCheck(
      "activityBuckets(HOUR_IST) present",
      true,
      hourBucketsCount,
      hourBucketsCount > 0
    );
    const ok = checks.every((c) => c.pass);
    const status = ok ? "VERIFIED" : "FAILED";
    const failedChecks = checks.filter((c) => !c.pass);
    const verificationErrorsJson = failedChecks.map((c) => ({
      name: c.name,
      expected: c.expected,
      actual: c.actual
    }));
    await prisma.productivityAnalysisRun.updateMany({
      where: { id: runId, organizationId },
      data: {
        status,
        verifiedAt: ok ? /* @__PURE__ */ new Date() : null,
        verificationErrorsJson
      }
    });
    return {
      ok,
      runId,
      status,
      failedChecks: failedChecks.map((c) => c.name),
      rowCounts: {
        contributors: contributorsCount,
        commitTypes: commitTypesCount,
        weeklyVolume: weeklyVolumeCount,
        activityBuckets: activityBucketsCount,
        largeCommits: largeCommitsCount,
        insights: insightsCount
      },
      checks
    };
  }
});

export { verifyProductivityReportTool };
