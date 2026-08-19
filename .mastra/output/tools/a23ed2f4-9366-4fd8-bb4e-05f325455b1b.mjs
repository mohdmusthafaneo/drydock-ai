import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import crypto from 'node:crypto';
import { p as prisma } from '../prisma.mjs';
import { r as resolveOrganizationId } from '../request-context.mjs';
import '@prisma/adapter-pg';
import 'pg';
import 'node:path';
import 'node:url';
import '@prisma/client/runtime/client';

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}
function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
const driverSchema = z.object({
  feature: z.string().optional().nullable(),
  value: z.number().optional().nullable(),
  contribution: z.number().optional().nullable(),
  label: z.string().optional().nullable()
});
const worstFileSchema = z.object({
  file_path: z.string(),
  score: z.number().nullable().optional(),
  max_ccn: z.number().nullable().optional(),
  max_nesting: z.number().nullable().optional(),
  nloc: z.number().nullable().optional(),
  duplication_pct: z.number().nullable().optional(),
  has_test_file: z.boolean().nullable().optional()
});
const healthFindingSchema = z.object({
  biomarker_type: z.string().optional().nullable(),
  severity: z.string().optional().nullable(),
  file_path: z.string().optional().nullable(),
  function_name: z.string().nullable().optional(),
  health_impact: z.number().optional().nullable(),
  reason: z.string().optional().nullable()
});
const deadCodeFindingSchema = z.object({
  kind: z.string().optional().nullable(),
  file_path: z.string().optional().nullable(),
  symbol: z.string().optional().nullable(),
  confidence: z.number().optional().nullable(),
  reason: z.string().optional().nullable(),
  cleanup_ready: z.boolean().optional().nullable()
});
const riskSchema = z.object({
  score: z.number().optional().nullable(),
  probability: z.number().optional().nullable(),
  level: z.string().optional().nullable(),
  risk_percentile: z.number().optional().nullable(),
  review_priority: z.string().optional().nullable(),
  summary: z.string().optional(),
  drivers: z.array(driverSchema).optional()
});
const persistGovernanceReportTool = createTool({
  id: "persist-governance-report",
  description: "Persist a Governance analysis run (repowise risk + health + dead-code) into tenant-scoped normalized Prisma tables.",
  inputSchema: z.object({
    organizationId: z.string().optional(),
    repository_url: z.string().min(1),
    repository_name: z.string().min(1),
    revspec: z.string().min(1),
    branch: z.string().optional(),
    risk: riskSchema,
    drivers: z.array(driverSchema).optional().default([]),
    kpis: z.record(z.string(), z.unknown()).optional().default({}),
    worst_files: z.array(worstFileSchema).optional().default([]),
    findings: z.array(healthFindingSchema).optional().default([]),
    dead_code_findings: z.array(deadCodeFindingSchema).optional().default([])
  }),
  outputSchema: z.object({
    runId: z.string(),
    organizationId: z.string(),
    repositoryName: z.string(),
    revspec: z.string(),
    reportSha256: z.string(),
    reused: z.boolean(),
    headline: z.object({
      riskScore: z.number().nullable(),
      riskPercentile: z.number().nullable(),
      riskLevel: z.string().nullable(),
      worstFilePath: z.string().nullable(),
      worstFileScore: z.number().nullable(),
      driversCount: z.number(),
      worstFilesCount: z.number(),
      findingsCount: z.number(),
      deadCodeFindingsCount: z.number(),
      kpisCount: z.number()
    }),
    rowCounts: z.object({
      kpis: z.number(),
      worstFiles: z.number(),
      riskDrivers: z.number(),
      healthFindings: z.number(),
      deadCodeFindings: z.number()
    }),
    rowsPersisted: z.number()
  }),
  toModelOutput: (output) => {
    if (!output || typeof output !== "object" || !("runId" in output)) {
      return { type: "text", value: "Persisting governance analysis..." };
    }
    const o = output;
    return {
      type: "text",
      value: `Governance persisted: runId=${o.runId} reused=${o.reused} (drivers=${o.headline?.driversCount ?? 0}, worstFiles=${o.headline?.worstFilesCount ?? 0}).`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to persist governance analysis. Provide it via RequestContext or persistGovernanceReportTool.organizationId."
      );
    }
    const drivers = inputData.drivers ?? inputData.risk.drivers ?? [];
    const worstFiles = inputData.worst_files ?? [];
    const findings = inputData.findings ?? [];
    const deadCodeFindings = inputData.dead_code_findings ?? [];
    const kpis = inputData.kpis ?? {};
    const headlineRiskScore = inputData.risk.score ?? null;
    const headlineRiskPercentile = inputData.risk.risk_percentile ?? null;
    const headlineRiskLevel = inputData.risk.level ?? null;
    const headlineWorstFilePath = worstFiles[0]?.file_path ?? null;
    const headlineWorstFileScore = worstFiles[0]?.score === void 0 || worstFiles[0]?.score === null ? null : Number(worstFiles[0].score);
    const headline = {
      riskScore: headlineRiskScore == null ? null : Number(headlineRiskScore),
      riskPercentile: headlineRiskPercentile == null ? null : Number(headlineRiskPercentile),
      riskLevel: headlineRiskLevel == null ? null : String(headlineRiskLevel),
      worstFilePath: headlineWorstFilePath == null ? null : String(headlineWorstFilePath),
      worstFileScore: headlineWorstFileScore == null ? null : Number(headlineWorstFileScore),
      driversCount: drivers.length,
      worstFilesCount: worstFiles.length,
      findingsCount: findings.length,
      deadCodeFindingsCount: deadCodeFindings.length,
      kpisCount: Object.keys(kpis).length
    };
    const driversNorm = drivers.map((d) => ({
      feature: d.feature ?? null,
      value: d.value ?? null,
      contribution: d.contribution ?? null,
      label: d.label ?? null
    })).map((d, i) => ({ rank: i + 1, ...d }));
    const worstFilesNorm = worstFiles.map((w) => ({
      filePath: w.file_path,
      score: w.score ?? null,
      maxCcn: w.max_ccn ?? null,
      maxNesting: w.max_nesting ?? null,
      nloc: w.nloc ?? null,
      duplicationPct: w.duplication_pct ?? null,
      hasTestFile: w.has_test_file ?? null
    })).map((w, i) => ({ rank: i + 1, ...w }));
    const findingsNorm = findings.map((f) => ({
      severity: f.severity ?? null,
      biomarkerType: f.biomarker_type ?? null,
      filePath: f.file_path ?? null,
      functionName: f.function_name ?? null,
      healthImpact: f.health_impact ?? null,
      reason: f.reason ?? null
    })).map((f, i) => ({ rank: i + 1, ...f }));
    const deadCodeNorm = deadCodeFindings.map((d) => ({
      kind: d.kind ?? null,
      filePath: d.file_path ?? null,
      symbol: d.symbol ?? null,
      confidence: d.confidence ?? null,
      reason: d.reason ?? null,
      cleanupReady: d.cleanup_ready ?? null
    })).map((d, i) => ({ rank: i + 1, ...d }));
    const kpisStable = Object.keys(kpis).sort().map((kpiKey) => {
      const v = kpis[kpiKey];
      if (typeof v === "number" && Number.isFinite(v)) return [kpiKey, { f: v, s: null }];
      if (v == null) return [kpiKey, { f: null, s: null }];
      return [kpiKey, { f: null, s: String(v) }];
    });
    const reportSha256 = sha256(
      JSON.stringify({
        repositoryName: inputData.repository_name,
        revspec: inputData.revspec,
        risk: {
          score: inputData.risk.score ?? null,
          probability: inputData.risk.probability ?? null,
          level: inputData.risk.level ?? null,
          risk_percentile: inputData.risk.risk_percentile ?? null,
          review_priority: inputData.risk.review_priority ?? null,
          summary: inputData.risk.summary ?? null
        },
        drivers: driversNorm,
        kpis: kpisStable,
        worstFiles: worstFilesNorm,
        findings: findingsNorm,
        deadCodeFindings: deadCodeNorm
      })
    );
    const uniqueWhere = {
      organizationId,
      repositoryName: inputData.repository_name,
      revspec: inputData.revspec,
      reportSha256
    };
    const existing = await prisma.governanceAnalysisRun.findUnique({
      where: { organizationId_repositoryName_revspec_reportSha256: uniqueWhere }
    });
    if (existing?.status === "VERIFIED") {
      return {
        runId: existing.id,
        organizationId,
        repositoryName: existing.repositoryName,
        revspec: existing.revspec,
        reportSha256,
        reused: true,
        headline: {
          riskScore: existing.headlineRiskScore ?? null,
          riskPercentile: existing.headlineRiskPercentile ?? null,
          riskLevel: existing.headlineRiskLevel ?? null,
          worstFilePath: existing.headlineWorstFilePath ?? null,
          worstFileScore: existing.headlineWorstFileScore ?? null,
          driversCount: existing.headlineDriversCount ?? 0,
          worstFilesCount: existing.headlineWorstFilesCount ?? 0,
          findingsCount: existing.headlineFindingsCount ?? 0,
          deadCodeFindingsCount: existing.headlineDeadCodeFindingsCount ?? 0,
          kpisCount: existing.headlineKpisCount ?? 0
        },
        rowCounts: { kpis: 0, worstFiles: 0, riskDrivers: 0, healthFindings: 0, deadCodeFindings: 0 },
        rowsPersisted: 0
      };
    }
    const chunkSize = 500;
    const result = await prisma.$transaction(async (tx) => {
      const runRow = await tx.governanceAnalysisRun.upsert({
        where: { organizationId_repositoryName_revspec_reportSha256: uniqueWhere },
        create: {
          organizationId,
          repositoryName: inputData.repository_name,
          repositoryUrl: inputData.repository_url,
          revspec: inputData.revspec,
          reportSha256,
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],
          headlineRiskScore: headline.riskScore,
          headlineProbability: inputData.risk.probability ?? null,
          headlineRiskLevel: headline.riskLevel,
          headlineRiskPercentile: headline.riskPercentile,
          headlineReviewPriority: inputData.risk.review_priority ?? null,
          headlineSummary: inputData.risk.summary ?? null,
          headlineDriversCount: headline.driversCount,
          headlineWorstFilesCount: headline.worstFilesCount,
          headlineFindingsCount: headline.findingsCount,
          headlineDeadCodeFindingsCount: headline.deadCodeFindingsCount,
          headlineKpisCount: headline.kpisCount,
          headlineWorstFilePath: headline.worstFilePath,
          headlineWorstFileScore: headline.worstFileScore
        },
        update: {
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],
          repositoryUrl: inputData.repository_url,
          headlineRiskScore: headline.riskScore,
          headlineProbability: inputData.risk.probability ?? null,
          headlineRiskLevel: headline.riskLevel,
          headlineRiskPercentile: headline.riskPercentile,
          headlineReviewPriority: inputData.risk.review_priority ?? null,
          headlineSummary: inputData.risk.summary ?? null,
          headlineDriversCount: headline.driversCount,
          headlineWorstFilesCount: headline.worstFilesCount,
          headlineFindingsCount: headline.findingsCount,
          headlineDeadCodeFindingsCount: headline.deadCodeFindingsCount,
          headlineKpisCount: headline.kpisCount,
          headlineWorstFilePath: headline.worstFilePath,
          headlineWorstFileScore: headline.worstFileScore
        }
      });
      const runId = runRow.id;
      const kpiRows = Object.keys(kpisStable).length ? kpisStable.map((pair) => {
        const [kpiKey, norm] = pair;
        return {
          runId,
          organizationId,
          kpiKey,
          valueFloat: norm.f ?? null,
          valueString: norm.s
        };
      }) : [];
      const worstFileRows = worstFilesNorm.map((w) => ({
        runId,
        organizationId,
        rank: w.rank,
        filePath: w.filePath,
        score: w.score,
        maxCcn: w.maxCcn,
        maxNesting: w.maxNesting,
        nloc: w.nloc,
        duplicationPct: w.duplicationPct,
        hasTestFile: w.hasTestFile
      }));
      const riskDriverRows = driversNorm.map((d) => ({
        runId,
        organizationId,
        rank: d.rank,
        feature: d.feature,
        value: d.value,
        contribution: d.contribution,
        label: d.label
      }));
      const healthFindingRows = findingsNorm.map((f) => ({
        runId,
        organizationId,
        rank: f.rank,
        severity: f.severity,
        biomarkerType: f.biomarkerType,
        filePath: f.filePath,
        functionName: f.functionName,
        healthImpact: f.healthImpact,
        reason: f.reason
      }));
      const deadCodeRows = deadCodeNorm.map((d) => ({
        runId,
        organizationId,
        rank: d.rank,
        kind: d.kind,
        filePath: d.filePath,
        symbol: d.symbol,
        confidence: d.confidence,
        reason: d.reason,
        cleanupReady: d.cleanupReady
      }));
      let rowCounts = {
        kpis: 0,
        worstFiles: 0,
        riskDrivers: 0,
        healthFindings: 0,
        deadCodeFindings: 0
      };
      for (const chunk of chunkArray(kpiRows, chunkSize)) {
        const res = await tx.governanceKpiStat.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.kpis += res.count;
      }
      for (const chunk of chunkArray(worstFileRows, chunkSize)) {
        const res = await tx.governanceWorstFileStat.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.worstFiles += res.count;
      }
      for (const chunk of chunkArray(riskDriverRows, chunkSize)) {
        const res = await tx.governanceRiskDriver.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.riskDrivers += res.count;
      }
      for (const chunk of chunkArray(healthFindingRows, chunkSize)) {
        const res = await tx.governanceHealthFinding.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.healthFindings += res.count;
      }
      for (const chunk of chunkArray(deadCodeRows, chunkSize)) {
        const res = await tx.governanceDeadCodeFinding.createMany({
          data: chunk,
          skipDuplicates: true
        });
        rowCounts.deadCodeFindings += res.count;
      }
      return { runId, rowCounts };
    });
    return {
      runId: result.runId,
      organizationId,
      repositoryName: inputData.repository_name,
      revspec: inputData.revspec,
      reportSha256,
      reused: false,
      headline,
      rowCounts: result.rowCounts,
      rowsPersisted: result.rowCounts.kpis + result.rowCounts.worstFiles + result.rowCounts.riskDrivers + result.rowCounts.healthFindings + result.rowCounts.deadCodeFindings
    };
  }
});

export { persistGovernanceReportTool };
