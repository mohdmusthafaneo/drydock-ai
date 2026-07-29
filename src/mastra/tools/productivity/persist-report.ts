import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { productivityWorkspace } from "../../workspace";
import { analyzeGitReportSchema, mapReportToRows } from "./report-schema";
import { resolveOrganizationId } from "../../config/request-context";
import { prisma } from "@/lib/prisma";

function parseRepositoryName(repositoryUrl: string): string {
  const cleaned = repositoryUrl.trim().split("#")[0].split("?")[0];
  const last = cleaned.split("/").pop() ?? "";
  const noGit = last.replace(/\.git$/i, "");
  if (!noGit.trim()) throw new Error(`Could not parse repository name from URL: ${repositoryUrl}`);
  return noGit;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunkArray size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function assertPathInsideBase(resolvedPath: string, basePath: string) {
  const base = path.resolve(basePath);
  const target = path.resolve(resolvedPath);
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`report_path escapes workspace basePath: ${resolvedPath}`);
  }
}

export const persistProductivityReportTool = createTool({
  id: "persist-productivity-report",
  description:
    "Read an analyze-git report JSON from the productivity workspace and persist it into tenant-scoped normalized Prisma tables. Never pass the full JSON back to the model; only pass a short run summary.",
  inputSchema: z.object({
    report_path: z.string().min(1).describe("Absolute path to analyze-git-report.json"),
    repository_url: z.string().min(1),
    branch: z.string().optional(),
    organizationId: z.string().optional(),
  }),
  outputSchema: z.object({
    runId: z.string(),
    organizationId: z.string(),
    repository: z.string(),
    branch: z.string(),
    reportPath: z.string(),
    reused: z.boolean(),
    reportSha256: z.string(),
    headline: z.object({
      commits: z.number(),
      contributors: z.number(),
      activeDays: z.number(),
      netGrowthProduct: z.number(),
    }),
    rowCounts: z.object({
      run: z.number(),
      contributors: z.number(),
      commitTypes: z.number(),
      weeklyVolume: z.number(),
      activityBuckets: z.number(),
      areaStats: z.number(),
      largeCommits: z.number(),
      insights: z.number(),
    }),
    rowsPersisted: z.number(),
  }),
  toModelOutput: (output) => {
    const rows = output.rowCounts;
    return {
      type: "text" as const,
      value: `Productivity persisted: runId=${output.runId} reused=${output.reused} (rows: contributors=${rows.contributors}, commitTypes=${rows.commitTypes}, largeCommits=${rows.largeCommits}).`,
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId,
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to persist productivity analysis. Provide it via RequestContext or pass it as persistProductivityReportTool.organizationId.",
      );
    }

    const basePath = productivityWorkspace.filesystem!.basePath;
    const reportPathResolved = path.isAbsolute(inputData.report_path)
      ? inputData.report_path
      : path.join(basePath, inputData.report_path);

    const reportPathAbs = path.resolve(reportPathResolved);
    assertPathInsideBase(reportPathAbs, basePath);

    const reportBytes = await fs.readFile(reportPathAbs);
    const reportSha256 = crypto.createHash("sha256").update(reportBytes).digest("hex");

    const jsonRaw = reportBytes.toString("utf8");
    const json = JSON.parse(jsonRaw) as unknown;
    const parsed = analyzeGitReportSchema.parse(json);

    const repositoryName = parseRepositoryName(inputData.repository_url);
    const branch = inputData.branch ?? parsed.report.branch_analyzed;

    const mastraTraceId = context?.tracing?.currentSpan?.traceId;
    const mastraThreadId = context?.agent?.threadId;
    const mastraRunId = context?.workflow && "runId" in context.workflow ? context.workflow.runId : undefined;

    const uniqueWhere = {
      organizationId,
      repositoryName,
      branch,
      reportSha256,
    };

    const existing = await prisma.productivityAnalysisRun.findUnique({
      where: {
        organizationId_repositoryName_branch_reportSha256: uniqueWhere,
      },
    });

    const headline = {
      commits: parsed.headline.total_commits,
      contributors: parsed.contributors.length,
      activeDays: parsed.headline.active_days,
      netGrowthProduct: parsed.headline.net_growth_product,
    };

    if (existing?.status === "VERIFIED") {
      return {
        runId: existing.id,
        organizationId,
        repository: repositoryName,
        branch,
        reportPath: reportPathAbs,
        reused: true,
        reportSha256,
        headline,
        rowCounts: {
          run: 0,
          contributors: 0,
          commitTypes: 0,
          weeklyVolume: 0,
          activityBuckets: 0,
          areaStats: 0,
          largeCommits: 0,
          insights: 0,
        },
        rowsPersisted: 0,
      };
    }

    const runContext = {
      repositoryName,
      repositoryUrl: inputData.repository_url,
      branch,

      reportPath: reportPathAbs,
      reportSha256,

      mastraTraceId,
      mastraThreadId,
      mastraRunId,
    };

    const mapped = mapReportToRows(parsed, runContext);

    const {
      run: runCreateData,
      contributors,
      commitTypes,
      weeklyVolume,
      activityBuckets,
      areaStats,
      largeCommits,
      insights,
    } = mapped;

    const result = await prisma.$transaction(async (tx) => {
      const runRow = await tx.productivityAnalysisRun.upsert({
        where: {
          organizationId_repositoryName_branch_reportSha256: uniqueWhere,
        },
        create: {
          ...runCreateData,
          organizationId,
        },
        update: {
          ...runCreateData,
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],
        },
      });

      const runId = runRow.id;

      const contributorsRows = contributors.map((r) => ({ ...r, runId, organizationId }));
      const commitTypeRows = commitTypes.map((r) => ({ ...r, runId, organizationId }));
      const weeklyVolumeRows = weeklyVolume.map((r) => ({ ...r, runId, organizationId }));
      const activityBucketRows = activityBuckets.map((r) => ({ ...r, runId, organizationId }));
      const areaStatRows = areaStats.map((r) => ({ ...r, runId, organizationId }));
      const largeCommitRows = largeCommits.map((r) => ({ ...r, runId, organizationId }));
      const insightRows = insights.map((r) => ({ ...r, runId, organizationId }));

      const rowCounts = {
        run: 1,
        contributors: 0,
        commitTypes: 0,
        weeklyVolume: 0,
        activityBuckets: 0,
        areaStats: 0,
        largeCommits: 0,
        insights: 0,
      };

      const chunkSize = 500;

      for (const chunk of chunkArray(contributorsRows, chunkSize)) {
        const res = await tx.productivityContributorStat.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.contributors += res.count;
      }

      for (const chunk of chunkArray(commitTypeRows, chunkSize)) {
        const res = await tx.productivityCommitTypeStat.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.commitTypes += res.count;
      }

      for (const chunk of chunkArray(weeklyVolumeRows, chunkSize)) {
        const res = await tx.productivityWeeklyVolume.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.weeklyVolume += res.count;
      }

      for (const chunk of chunkArray(activityBucketRows, chunkSize)) {
        const res = await tx.productivityActivityBucket.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.activityBuckets += res.count;
      }

      for (const chunk of chunkArray(areaStatRows, chunkSize)) {
        const res = await tx.productivityAreaStat.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.areaStats += res.count;
      }

      for (const chunk of chunkArray(largeCommitRows, chunkSize)) {
        const res = await tx.productivityLargeCommit.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.largeCommits += res.count;
      }

      for (const chunk of chunkArray(insightRows, chunkSize)) {
        const res = await tx.productivityInsight.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.insights += res.count;
      }

      return { runId, reportSha256, rowCounts };
    });

    const rowsPersisted =
      result.rowCounts.contributors +
      result.rowCounts.commitTypes +
      result.rowCounts.weeklyVolume +
      result.rowCounts.activityBuckets +
      result.rowCounts.areaStats +
      result.rowCounts.largeCommits +
      result.rowCounts.insights;

    return {
      runId: result.runId,
      organizationId,
      repository: repositoryName,
      branch,
      reportPath: reportPathAbs,
      reused: false,
      reportSha256: result.reportSha256,
      headline,
      rowCounts: result.rowCounts,
      rowsPersisted,
    };
  },
});

