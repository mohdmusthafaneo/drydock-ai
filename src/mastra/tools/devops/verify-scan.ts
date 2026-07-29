import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { forOrg } from "@/lib/prisma";
import { resolveOrganizationId } from "../../config/request-context";

export const verifyDevOpsAccountScanTool = createTool({
  id: "verify-devops-account-scan",
  description:
    "Re-query a persisted DevOpsAccountScanRun and validate normalized row integrity. Marks the run VERIFIED or FAILED.",
  inputSchema: z.object({
    run_id: z.string().min(1),
    organizationId: z.string().optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    runId: z.string(),
    status: z.enum(["VERIFIED", "FAILED"]),
    failedChecks: z.array(z.string()),
    rowCounts: z.object({
      severityStats: z.number(),
      resourceTypeStats: z.number(),
      resources: z.number(),
      findings: z.number(),
      warnings: z.number(),
    }),
    checks: z.array(
      z.object({
        name: z.string(),
        expected: z.any(),
        actual: z.any(),
        pass: z.boolean(),
      }),
    ),
  }),
  toModelOutput: (output) => {
    const failedNames = output.failedChecks.slice(0, 5).join(", ");
    return {
      type: "text" as const,
      value: `DevOps verification ${output.ok ? "passed" : "failed"} for runId=${output.runId} (${output.status})${
        failedNames ? ` Failed checks: ${failedNames}` : ""
      }`,
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId,
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to verify DevOps scans. Provide it via RequestContext or as verifyDevOpsAccountScanTool.organizationId.",
      );
    }

    const db = forOrg(organizationId);

    const run = await db.devOpsAccountScanRun.findFirst({
      where: { id: inputData.run_id },
    });

    if (!run) {
      throw new Error(
        `No DevOpsAccountScanRun found for run_id=${inputData.run_id} in organizationId=${organizationId}`,
      );
    }

    const runId = run.id;

    const resourcesCount = await db.devOpsResourceInventory.count({ where: { runId } });
    const findingsCount = await db.devOpsHygieneFinding.count({ where: { runId } });
    const warningsCount = await db.devOpsAccountScanWarning.count({ where: { runId } });

    const severityAgg = await db.devOpsSeverityStat.aggregate({
      where: { runId },
      _sum: { count: true },
      _count: { _all: true },
    });
    const severitySum = severityAgg._sum.count ?? 0;
    const severityStatRows = severityAgg._count._all;

    const typeAgg = await db.devOpsResourceTypeStat.aggregate({
      where: { runId },
      _sum: { count: true },
      _count: { _all: true },
    });
    const resourceTypeSum = typeAgg._sum.count ?? 0;
    const resourceTypeStatRows = typeAgg._count._all;

    const resourceTypeRows = resourceTypeStatRows;

    const expected = {
      resources: run.headlineResourcesCount ?? 0,
      findings: run.headlineFindingsCount ?? 0,
      warnings: run.headlineWarningsCount ?? 0,
    };

    const checks: Array<{
      name: string;
      expected: unknown;
      actual: unknown;
      pass: boolean;
    }> = [];

    const addCheck = (name: string, exp: unknown, act: unknown) => {
      checks.push({ name, expected: exp, actual: act, pass: act === exp });
    };

    addCheck("sum(severityStats.count)==findings", expected.findings, severitySum);
    addCheck("resources row count", expected.resources, resourcesCount);
    addCheck("sum(resourceTypeStats.count)==resources", expected.resources, resourceTypeSum);
    addCheck("findings row count", expected.findings, findingsCount);
    addCheck("warnings row count", expected.warnings, warningsCount);

    const ok = checks.every((c) => c.pass);
    const status: "VERIFIED" | "FAILED" = ok ? "VERIFIED" : "FAILED";
    const failedChecks = checks.filter((c) => !c.pass).map((c) => c.name);

    const verificationErrorsJson = failedChecks.map((name) => {
      const check = checks.find((c) => c.name === name)!;
      return { name: check.name, expected: check.expected, actual: check.actual };
    }) as unknown as Prisma.InputJsonValue;

    await db.devOpsAccountScanRun.updateMany({
      where: { id: runId },
      data: {
        status,
        verifiedAt: ok ? new Date() : null,
        verificationErrorsJson,
      },
    });

    return {
      ok,
      runId,
      status,
      failedChecks,
      rowCounts: {
        severityStats: severityStatRows,
        resourceTypeStats: resourceTypeRows,
        resources: resourcesCount,
        findings: findingsCount,
        warnings: warningsCount,
      },
      checks,
    };
  },
});

