import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";
import { resolveOrganizationId } from "../../config/request-context";

const QA_PRESET_VALUES = ["OPEN_BUGS", "BLOCKED", "OPEN", "DONE"] as const;
type QAPreset = (typeof QA_PRESET_VALUES)[number];

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunkArray size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const persistQAReportTool = createTool({
  id: "persist-qa-report",
  description:
    "Persist a Jira QA analysis run into tenant-scoped normalized Prisma tables. Stores only normalized rows (no JSON blobs for dashboards).",
  inputSchema: z.object({
    organizationId: z.string().optional(),

    projectKeys: z.array(z.string().min(1)).min(1),
    statusBuckets: z
      .array(
        z.object({
          preset: z.enum(QA_PRESET_VALUES),
          count: z.number().int().nonnegative(),
        }),
      )
      .nonempty(),
    issueEvidence: z
      .array(
        z.object({
          preset: z.enum(QA_PRESET_VALUES),
          issueKey: z.string().min(1),
          summary: z.string().min(1),
          status: z.string().min(1),
          issueType: z.string().min(1),
          priority: z.string().optional().nullable(),
          assignee: z.string().optional().nullable(),
        }),
      )
      .max(200)
      .default([]),
  }),
  outputSchema: z.object({
    runId: z.string(),
    organizationId: z.string(),
    projectScopeHash: z.string(),
    reportSha256: z.string(),

    headline: z.object({
      openBugs: z.number(),
      blocked: z.number(),
      open: z.number(),
      done: z.number(),
      issueEvidence: z.number(),
    }),

    reused: z.boolean(),

    rowCounts: z.object({
      projectKeys: z.number(),
      statusStats: z.number(),
      issueEvidence: z.number(),
    }),

    rowsPersisted: z.number(),
  }),
  toModelOutput: (output) => {
    if (!output || typeof output !== "object" || !("runId" in output)) {
      return { type: "text" as const, value: "Persisting QA analysis..." };
    }
    const rowCounts = (output as (typeof output) & { rowCounts?: any }).rowCounts;
    return {
      type: "text" as const,
      value: `QA persisted: runId=${(output as any).runId} reused=${(output as any).reused} (statusRows=${rowCounts?.statusStats ?? 0}, issueRows=${rowCounts?.issueEvidence ?? 0}).`,
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId,
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to persist QA analysis. Provide it via RequestContext or as persistQAReportTool.organizationId.",
      );
    }

    const projectKeys = [...new Set(inputData.projectKeys.map((k) => k.trim()).filter(Boolean))].sort();
    if (projectKeys.length === 0) {
      throw new Error("projectKeys must contain at least one non-empty project key");
    }

    const statusMap: Record<QAPreset, number> = {
      OPEN_BUGS: 0,
      BLOCKED: 0,
      OPEN: 0,
      DONE: 0,
    };
    for (const b of inputData.statusBuckets) {
      statusMap[b.preset] = b.count;
    }

    const headline = {
      openBugs: statusMap.OPEN_BUGS,
      blocked: statusMap.BLOCKED,
      open: statusMap.OPEN,
      done: statusMap.DONE,
      issueEvidence: inputData.issueEvidence.length,
    };

    const projectScopeHash = sha256(projectKeys.join("|"));

    const normalizedEvidence = inputData.issueEvidence
      .map((e) => ({
        preset: e.preset,
        issueKey: e.issueKey.trim(),
        summary: e.summary.trim(),
        status: e.status.trim(),
        issueType: e.issueType.trim(),
        priority: e.priority ?? null,
        assignee: e.assignee ?? null,
      }))
      .sort((a, b) => a.preset.localeCompare(b.preset) || a.issueKey.localeCompare(b.issueKey));

    const normalizedStatusBuckets = (QA_PRESET_VALUES as readonly QAPreset[])
      .map((preset) => ({ preset, count: statusMap[preset] }));

    const reportSha256 = sha256(
      JSON.stringify({
        projectKeys,
        projectScopeHash,
        statusBuckets: normalizedStatusBuckets,
        issueEvidence: normalizedEvidence,
      }),
    );

    const uniqueWhere = {
      organizationId,
      projectScopeHash,
      reportSha256,
    };

    const existing = await prisma.qAAnalysisRun.findUnique({
      where: { organizationId_projectScopeHash_reportSha256: uniqueWhere },
    });

    if (existing?.status === "VERIFIED") {
      return {
        runId: existing.id,
        organizationId,
        projectScopeHash,
        reportSha256,
        headline: {
          openBugs: existing.headlineOpenBugsCount ?? 0,
          blocked: existing.headlineBlockedCount ?? 0,
          open: existing.headlineOpenCount ?? 0,
          done: existing.headlineDoneCount ?? 0,
          issueEvidence: existing.headlineIssueEvidenceCount ?? 0,
        },
        reused: true,
        rowCounts: { projectKeys: 0, statusStats: 0, issueEvidence: 0 },
        rowsPersisted: 0,
      };
    }

    const chunkSize = 500;

    const result = await prisma.$transaction(async (tx) => {
      const runRow = await tx.qAAnalysisRun.upsert({
        where: { organizationId_projectScopeHash_reportSha256: uniqueWhere },
        create: {
          organizationId,
          projectScopeHash,
          reportSha256,

          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],

          projectKeysCount: projectKeys.length,
          headlineOpenBugsCount: headline.openBugs,
          headlineBlockedCount: headline.blocked,
          headlineOpenCount: headline.open,
          headlineDoneCount: headline.done,
          headlineIssueEvidenceCount: headline.issueEvidence,
        },
        update: {
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],

          projectKeysCount: projectKeys.length,
          headlineOpenBugsCount: headline.openBugs,
          headlineBlockedCount: headline.blocked,
          headlineOpenCount: headline.open,
          headlineDoneCount: headline.done,
          headlineIssueEvidenceCount: headline.issueEvidence,
        },
      });

      const runId = runRow.id;

      const projectKeyRows = projectKeys.map((projectKey) => ({
        runId,
        organizationId,
        projectKey,
      }));
      const statusRows = (QA_PRESET_VALUES as readonly QAPreset[]).map((preset) => ({
        runId,
        organizationId,
        preset,
        count: statusMap[preset],
      }));
      const issueRows = normalizedEvidence.map((e) => ({
        runId,
        organizationId,
        preset: e.preset,
        issueKey: e.issueKey,
        summary: e.summary,
        status: e.status,
        issueType: e.issueType,
        priority: e.priority,
        assignee: e.assignee,
      }));

      const rowCounts = {
        projectKeys: 0,
        statusStats: 0,
        issueEvidence: 0,
      };

      for (const chunk of chunkArray(projectKeyRows, chunkSize)) {
        const res = await tx.qAProjectKey.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.projectKeys += res.count;
      }

      // Status stats are tiny (4 rows), but we keep the chunk pattern consistent.
      for (const chunk of chunkArray(statusRows, chunkSize)) {
        const res = await tx.qAStatusStat.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.statusStats += res.count;
      }

      for (const chunk of chunkArray(issueRows, chunkSize)) {
        const res = await tx.qAIssueEvidence.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.issueEvidence += res.count;
      }

      return { runId, rowCounts };
    });

    return {
      runId: result.runId,
      organizationId,
      projectScopeHash,
      reportSha256,
      headline,
      reused: false,
      rowCounts: result.rowCounts,
      rowsPersisted:
        result.rowCounts.projectKeys +
        result.rowCounts.statusStats +
        result.rowCounts.issueEvidence,
    };
  },
});

