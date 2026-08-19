import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { f as forOrg } from '../prisma.mjs';
import { r as resolveOrganizationId } from '../request-context.mjs';
import '@prisma/adapter-pg';
import 'pg';
import 'node:path';
import 'node:url';
import '@prisma/client/runtime/client';

const verifyGovernanceReportTool = createTool({
  id: "verify-governance-report",
  description: "Re-query a persisted GovernanceAnalysisRun and validate normalized row integrity. Marks the run VERIFIED or FAILED.",
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
      kpis: z.number(),
      worstFiles: z.number(),
      riskDrivers: z.number(),
      healthFindings: z.number(),
      deadCodeFindings: z.number()
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
    const failedNames = output.failedChecks.slice(0, 5).join(", ");
    return {
      type: "text",
      value: `Governance verification ${output.ok ? "passed" : "failed"} for runId=${output.runId} (${output.status})${failedNames ? ` Failed checks: ${failedNames}` : ""}`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to verify governance analysis. Provide it via RequestContext or as verifyGovernanceReportTool.organizationId."
      );
    }
    const db = forOrg(organizationId);
    const run = await db.governanceAnalysisRun.findFirst({
      where: { id: inputData.run_id }
    });
    if (!run) {
      throw new Error(
        `No GovernanceAnalysisRun found for run_id=${inputData.run_id} in organizationId=${organizationId}`
      );
    }
    const runId = run.id;
    const kpiCount = await db.governanceKpiStat.count({ where: { runId } });
    const worstFileCount = await db.governanceWorstFileStat.count({
      where: { runId }
    });
    const driverCount = await db.governanceRiskDriver.count({ where: { runId } });
    const findingsCount = await db.governanceHealthFinding.count({
      where: { runId }
    });
    const deadCodeCount = await db.governanceDeadCodeFinding.count({
      where: { runId }
    });
    const firstWorstFile = await db.governanceWorstFileStat.findFirst({
      where: { runId },
      orderBy: { rank: "asc" }
    });
    const expected = {
      kpis: run.headlineKpisCount ?? 0,
      worstFiles: run.headlineWorstFilesCount ?? 0,
      riskDrivers: run.headlineDriversCount ?? 0,
      healthFindings: run.headlineFindingsCount ?? 0,
      deadCodeFindings: run.headlineDeadCodeFindingsCount ?? 0,
      worstFilePath: run.headlineWorstFilePath ?? null,
      worstFileScore: run.headlineWorstFileScore ?? null
    };
    const checks = [];
    const addCheck = (name, exp, act) => {
      checks.push({ name, expected: exp, actual: act, pass: act === exp });
    };
    addCheck("kpi rows", expected.kpis, kpiCount);
    addCheck("worstFiles rows", expected.worstFiles, worstFileCount);
    addCheck("riskDrivers rows", expected.riskDrivers, driverCount);
    addCheck("healthFindings rows", expected.healthFindings, findingsCount);
    addCheck("deadCodeFindings rows", expected.deadCodeFindings, deadCodeCount);
    addCheck(
      "worstFile(1).path",
      expected.worstFilePath,
      firstWorstFile?.filePath ?? null
    );
    addCheck(
      "worstFile(1).score",
      expected.worstFileScore,
      firstWorstFile?.score ?? null
    );
    const ok = checks.every((c) => c.pass);
    const status = ok ? "VERIFIED" : "FAILED";
    const failedChecks = checks.filter((c) => !c.pass).map((c) => c.name);
    const verificationErrorsJson = failedChecks.map((name) => {
      const check = checks.find((c) => c.name === name);
      return { name: check.name, expected: check.expected, actual: check.actual };
    });
    await db.governanceAnalysisRun.updateMany({
      where: { id: runId },
      data: {
        status,
        verifiedAt: ok ? /* @__PURE__ */ new Date() : null,
        verificationErrorsJson
      }
    });
    const rowCounts = await Promise.all([
      db.governanceKpiStat.count({ where: { runId } }),
      db.governanceWorstFileStat.count({ where: { runId } }),
      db.governanceRiskDriver.count({ where: { runId } }),
      db.governanceHealthFinding.count({ where: { runId } }),
      db.governanceDeadCodeFinding.count({ where: { runId } })
    ]);
    return {
      ok,
      runId,
      status,
      failedChecks,
      rowCounts: {
        kpis: rowCounts[0],
        worstFiles: rowCounts[1],
        riskDrivers: rowCounts[2],
        healthFindings: rowCounts[3],
        deadCodeFindings: rowCounts[4]
      },
      checks
    };
  }
});

export { verifyGovernanceReportTool };
