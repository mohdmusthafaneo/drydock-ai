import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { f as forOrg } from '../prisma.mjs';
import { r as resolveOrganizationId } from '../request-context.mjs';
import '@prisma/adapter-pg';
import 'pg';
import 'node:path';
import 'node:url';
import '@prisma/client/runtime/client';

const verifyQAReportTool = createTool({
  id: "verify-qa-report",
  description: "Re-query a persisted QAAnalysisRun and validate normalized row integrity. Marks the run VERIFIED or FAILED.",
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
      projectKeys: z.number(),
      statusStats: z.number(),
      issueEvidence: z.number()
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
      value: `QA verification ${output.ok ? "passed" : "failed"} for runId=${output.runId} (${output.status})${failedNames ? ` Failed checks: ${failedNames}` : ""}`
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to verify QA analysis. Provide it via RequestContext or as verifyQAReportTool.organizationId."
      );
    }
    const db = forOrg(organizationId);
    const run = await db.qAAnalysisRun.findFirst({
      where: { id: inputData.run_id }
    });
    if (!run) {
      throw new Error(
        `No QAAnalysisRun found for run_id=${inputData.run_id} in organizationId=${organizationId}`
      );
    }
    const runId = run.id;
    const expected = {
      projectKeys: run.projectKeysCount ?? 0,
      openBugs: run.headlineOpenBugsCount ?? 0,
      blocked: run.headlineBlockedCount ?? 0,
      open: run.headlineOpenCount ?? 0,
      done: run.headlineDoneCount ?? 0,
      issueEvidence: run.headlineIssueEvidenceCount ?? 0
    };
    const statusRows = await db.qAStatusStat.findMany({ where: { runId } });
    const statusMap = {};
    for (const row of statusRows) statusMap[row.preset] = row.count;
    const evidenceCount = await db.qAIssueEvidence.count({ where: { runId } });
    const projectKeyCount = await db.qAProjectKey.count({ where: { runId } });
    const checks = [];
    const addCheck = (name, exp, act) => {
      checks.push({ name, expected: exp, actual: act, pass: act === exp });
    };
    addCheck("projectKeysCount", expected.projectKeys, projectKeyCount);
    addCheck("status(OPEN_BUGS).count", expected.openBugs, statusMap.OPEN_BUGS ?? 0);
    addCheck("status(BLOCKED).count", expected.blocked, statusMap.BLOCKED ?? 0);
    addCheck("status(OPEN).count", expected.open, statusMap.OPEN ?? 0);
    addCheck("status(DONE).count", expected.done, statusMap.DONE ?? 0);
    addCheck("issueEvidenceCount", expected.issueEvidence, evidenceCount);
    const ok = checks.every((c) => c.pass);
    const status = ok ? "VERIFIED" : "FAILED";
    const failedChecks = checks.filter((c) => !c.pass).map((c) => c.name);
    const verificationErrorsJson = failedChecks.map((name) => {
      const check = checks.find((c) => c.name === name);
      return { name: check.name, expected: check.expected, actual: check.actual };
    });
    await db.qAAnalysisRun.updateMany({
      where: { id: runId },
      data: {
        status,
        verifiedAt: ok ? /* @__PURE__ */ new Date() : null,
        verificationErrorsJson
      }
    });
    const rowCounts = await Promise.all([
      db.qAProjectKey.count({ where: { runId } }),
      db.qAStatusStat.count({ where: { runId } }),
      db.qAIssueEvidence.count({ where: { runId } })
    ]);
    return {
      ok,
      runId,
      status,
      failedChecks,
      rowCounts: {
        projectKeys: rowCounts[0],
        statusStats: rowCounts[1],
        issueEvidence: rowCounts[2]
      },
      checks
    };
  }
});

export { verifyQAReportTool };
