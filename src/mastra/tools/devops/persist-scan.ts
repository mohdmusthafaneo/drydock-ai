import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import crypto from "node:crypto";

import { runAwsAccountScan } from "../../aws/run-scan";
import type { HygieneFinding } from "../../aws/hygiene/HygieneEngine";
import { prisma } from "@/lib/prisma";
import { resolveOrganizationId } from "../../config/request-context";
import { isAwsTrulyConnected, mergeAwsMeta, parseAwsMeta } from "@/lib/aws-meta";
import { decryptToken } from "@/lib/token-crypto";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunkArray size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function stableHashAwsScan(report: {
  accountId: string;
  roleArn: string;
  regions: string[];
  counts: {
    resources: number;
    findings: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  warnings: string[];
  resources: Array<{
    resourceType?: string | null;
    resourceId: string;
    region?: string | null;
    name?: string | null;
    arn?: string | null;
  }>;
  findings: HygieneFinding[];
}): string {
  const h = crypto.createHash("sha256");
  h.update(report.accountId);
  h.update("|roleArn:");
  h.update(report.roleArn);
  h.update("|regions:");
  h.update([...report.regions].sort().join(","));

  h.update("|counts:");
  h.update(
    JSON.stringify({
      resources: report.counts.resources,
      findings: report.counts.findings,
      byType: Object.keys(report.counts.byType)
        .sort()
        .reduce((acc, k) => {
          acc[k] = report.counts.byType[k];
          return acc;
        }, {} as Record<string, number>),
      bySeverity: Object.keys(report.counts.bySeverity)
        .sort()
        .reduce((acc, k) => {
          acc[k] = report.counts.bySeverity[k];
          return acc;
        }, {} as Record<string, number>),
    }),
  );

  h.update("|warnings:");
  // Warnings order comes from scan; keep it stable for idempotency.
  for (const w of report.warnings) {
    h.update("\n");
    h.update(w);
  }

  h.update("|resources:");
  for (const r of report.resources) {
    h.update("\n");
    h.update(String(r.resourceType ?? ""));
    h.update("|");
    h.update(String(r.resourceId ?? ""));
    h.update("|");
    h.update(String(r.region ?? ""));
    h.update("|");
    h.update(String(r.name ?? ""));
    h.update("|");
    h.update(String(r.arn ?? ""));
  }

  h.update("|findings:");
  for (const f of report.findings) {
    h.update("\n");
    h.update(String(f.checkId));
    h.update("|");
    h.update(String(f.severity));
    h.update("|");
    h.update(String(f.title));
    h.update("|");
    h.update(String(f.description));
    h.update("|");
    h.update(String(f.recommendation));
    h.update("|");
    h.update(String(f.resourceType ?? ""));
    h.update("|");
    h.update(String(f.resourceRef ?? ""));
  }

  return h.digest("hex");
}

const severityEnum = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);

export const persistDevOpsAccountScanTool = createTool({
  id: "persist-devops-account-scan",
  description:
    "Run a DevOps AWS account hygiene scan (assume role + inventory + hygiene checks) and persist normalized scan results into tenant-scoped Prisma tables. Returns a runId after persistence.",
  inputSchema: z.object({
    organizationId: z.string().optional(),
    /** Optional when the org has a connected AWS integration with stored role ARN + External ID. */
    role_arn: z.string().min(1).optional(),
    external_id: z.string().min(1).optional(),
  }),
  outputSchema: z.object({
    runId: z.string(),
    organizationId: z.string(),
    accountId: z.string(),
    reportSha256: z.string(),
    reused: z.boolean(),
    headline: z.object({
      regionsCount: z.number(),
      resourcesCount: z.number(),
      findingsCount: z.number(),
      warningsCount: z.number(),
    }),
    rowCounts: z.object({
      severityStats: z.number(),
      resourceTypeStats: z.number(),
      resources: z.number(),
      findings: z.number(),
      warnings: z.number(),
    }),
    rowsPersisted: z.number(),
  }),
  background: {
    enabled: true,
    timeoutMs: 600_000,
    waitTimeoutMs: 600_000,
    maxRetries: 0,
  },
  toModelOutput: (output) => {
    if (!output || typeof output !== "object" || !("runId" in output)) {
      return {
        type: "text" as const,
        value: "AWS scan is running in the background. Waiting for persisted run...",
      };
    }
    const o = output as any;
    return {
      type: "text" as const,
      value: `DevOps persisted: runId=${o.runId} reused=${o.reused} (resources=${o.headline?.resourcesCount ?? 0}, findings=${o.headline?.findingsCount ?? 0}).`,
    };
  },
  execute: async (inputData, context) => {
    const organizationId = resolveOrganizationId(
      context?.requestContext,
      inputData.organizationId,
    );
    if (!organizationId) {
      throw new Error(
        "organizationId is required to persist DevOps scans. Provide it via RequestContext or as persistDevOpsAccountScanTool.organizationId.",
      );
    }

    let roleArn = inputData.role_arn?.trim();
    let externalId = inputData.external_id?.trim();

    const awsIntegration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "AWS" },
      },
    });

    if ((!roleArn || !externalId) && isAwsTrulyConnected(awsIntegration ?? undefined)) {
      const meta = parseAwsMeta(awsIntegration!.metadataJson);
      roleArn = roleArn || meta.roleArn;
      if (!externalId && meta.externalIdEnc) {
        try {
          externalId = decryptToken(meta.externalIdEnc);
        } catch {
          throw new Error(
            "Stored AWS External ID could not be decrypted. Re-save the AWS integration credentials.",
          );
        }
      }
    }

    if (!roleArn || !externalId) {
      throw new Error(
        "role_arn and external_id are required (or connect AWS on /integrations with a role ARN and External ID).",
      );
    }

    const report = await runAwsAccountScan({
      roleArn,
      externalId,
    });

    const reportSha256 = stableHashAwsScan(report);

    const uniqueWhere = {
      organizationId,
      accountId: report.accountId,
      roleArn: report.roleArn,
      reportSha256,
    };

    const existing = await prisma.devOpsAccountScanRun.findUnique({
      where: { organizationId_accountId_roleArn_reportSha256: uniqueWhere },
    });

    if (existing?.status === "VERIFIED") {
      if (awsIntegration) {
        const meta = parseAwsMeta(awsIntegration.metadataJson);
        await prisma.integration
          .update({
            where: { id: awsIntegration.id },
            data: {
              lastSyncAt: new Date(),
              metadataJson: mergeAwsMeta(meta, {
                lastScanAt: new Date().toISOString(),
                lastScanRunId: existing.id,
                lastScanSummary: `Reused verified scan — ${existing.headlineFindingsCount ?? 0} findings`,
                accountIdHint: existing.accountId,
                connectionStatus: "ok",
              }),
            },
          })
          .catch(() => undefined);
      }
      return {
        runId: existing.id,
        organizationId,
        accountId: existing.accountId,
        reportSha256,
        reused: true,
        headline: {
          regionsCount: report.regions.length,
          resourcesCount: existing.headlineResourcesCount ?? 0,
          findingsCount: existing.headlineFindingsCount ?? 0,
          warningsCount: existing.headlineWarningsCount ?? 0,
        },
        rowCounts: { severityStats: 0, resourceTypeStats: 0, resources: 0, findings: 0, warnings: 0 },
        rowsPersisted: 0,
      };
    }

    const severityEntries = Object.entries(report.counts.bySeverity);
    const typeEntries = Object.entries(report.counts.byType);

    const regionsCount = report.regions.length;
    const resourcesCount = report.counts.resources;
    const findingsCount = report.counts.findings;
    const warningsCount = report.warnings.length;

    const chunkSize = 500;

    const result = await prisma.$transaction(async (tx) => {
      const runRow = await tx.devOpsAccountScanRun.upsert({
        where: { organizationId_accountId_roleArn_reportSha256: uniqueWhere },
        create: {
          organizationId,
          accountId: report.accountId,
          roleArn: report.roleArn,

          regionsCount,
          durationMs: report.durationMs,
          reportSha256,

          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],

          headlineResourcesCount: resourcesCount,
          headlineFindingsCount: findingsCount,
          headlineWarningsCount: warningsCount,
        },
        update: {
          status: "PERSISTED",
          verifiedAt: null,
          verificationErrorsJson: [],

          regionsCount,
          durationMs: report.durationMs,
          headlineResourcesCount: resourcesCount,
          headlineFindingsCount: findingsCount,
          headlineWarningsCount: warningsCount,
        },
      });

      const runId = runRow.id;

      // Idempotent re-persist: replace children so skipDuplicates cannot silently drop rows.
      await tx.devOpsHygieneFinding.deleteMany({ where: { runId } });
      await tx.devOpsResourceInventory.deleteMany({ where: { runId } });
      await tx.devOpsSeverityStat.deleteMany({ where: { runId } });
      await tx.devOpsResourceTypeStat.deleteMany({ where: { runId } });
      await tx.devOpsAccountScanWarning.deleteMany({ where: { runId } });

      const severityStats = severityEntries.map(([severity, count]) => ({
        runId,
        organizationId,
        severity: severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
        count,
      }));

      const resourceTypeStats = typeEntries.map(([resourceType, count]) => ({
        runId,
        organizationId,
        resourceType,
        count,
      }));

      const warningRows = report.warnings.map((w, i) => ({
        runId,
        organizationId,
        rank: i + 1,
        warningText: w,
      }));

      const resourceRows = report.resources.map((r) => ({
        runId,
        organizationId,
        resourceType: r.resourceType ?? "",
        resourceId: r.resourceId,
        region: r.region ?? null,
        name: r.name ?? null,
        arn: r.arn ?? null,
      }));

      const findingRows = report.findings.map((f, i) => ({
        runId,
        organizationId,
        rank: i + 1,
        checkId: f.checkId,
        severity: f.severity as any,
        title: f.title,
        description: f.description,
        recommendation: f.recommendation,
        resourceType: f.resourceType ?? null,
        resourceRef: f.resourceRef ?? null,
      }));

      let rowCounts = {
        severityStats: 0,
        resourceTypeStats: 0,
        resources: 0,
        findings: 0,
        warnings: 0,
      };

      for (const chunk of chunkArray(severityStats, chunkSize)) {
        const res = await tx.devOpsSeverityStat.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.severityStats += res.count;
      }

      for (const chunk of chunkArray(resourceTypeStats, chunkSize)) {
        const res = await tx.devOpsResourceTypeStat.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.resourceTypeStats += res.count;
      }

      for (const chunk of chunkArray(warningRows, chunkSize)) {
        const res = await tx.devOpsAccountScanWarning.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.warnings += res.count;
      }

      for (const chunk of chunkArray(resourceRows, chunkSize)) {
        const res = await tx.devOpsResourceInventory.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.resources += res.count;
      }

      for (const chunk of chunkArray(findingRows, chunkSize)) {
        const res = await tx.devOpsHygieneFinding.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        rowCounts.findings += res.count;
      }

      return { runId, rowCounts };
    });

    if (awsIntegration) {
      const meta = parseAwsMeta(awsIntegration.metadataJson);
      const summary = `Scan complete — ${findingsCount} findings · ${resourcesCount} resources`;
      await prisma.integration
        .update({
          where: { id: awsIntegration.id },
          data: {
            lastSyncAt: new Date(),
            lastError: null,
            metadataJson: mergeAwsMeta(meta, {
              lastScanAt: new Date().toISOString(),
              lastScanRunId: result.runId,
              lastScanSummary: summary,
              accountIdHint: report.accountId,
              connectionStatus: "ok",
              lastError: undefined,
            }),
          },
        })
        .catch(() => undefined);
    }

    return {
      runId: result.runId,
      organizationId,
      accountId: report.accountId,
      reportSha256,
      reused: false,
      headline: {
        regionsCount,
        resourcesCount,
        findingsCount,
        warningsCount,
      },
      rowCounts: result.rowCounts,
      rowsPersisted:
        result.rowCounts.severityStats +
        result.rowCounts.resourceTypeStats +
        result.rowCounts.resources +
        result.rowCounts.findings +
        result.rowCounts.warnings,
    };
  },
});

