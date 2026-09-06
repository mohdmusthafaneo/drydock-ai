import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Models that carry `organizationId` and must be tenant-scoped via `forOrg()`.
 * `Organization` is intentionally excluded (it is the tenant root).
 */
export const TENANT_MODELS = new Set([
  "TelemetryMetric",
  "TelemetryEvent",
  "WebhookEvent",
  "OrgInvitation",
  "GovernancePolicy",
  "ComplianceRuleState",
  "ComplianceFinding",
  "ProblemPrediction",
  "DeploymentEvent",
  "DeliveryWorkflow",
  "Incident",
  "IncidentCodeLink",
  "Release",
  "AcceleratorProject",
  "User",
  "OrganizationProfile",
  "JiraCalibrationProfile",
  "DeliveryDNA",
  "Integration",
  "IntegrationConnectInvite",
  "Recommendation",
  "Approval",
  "AuditLog",
  "ActivityEvent",
  "CodeAnalysisRun",
  "CodeAnalysisCommit",
  "CodeAnalysisPullRequest",
  "DeliveryAnalysisSnapshot",
  "ExecutiveBriefingSnapshot",
  "AgentChatThread",
  "AgentChatMessage",
  "Embedding",
  "TicketSnapshot",
  "CommitSnapshot",
  "EvidenceLink",
  "EvidenceReview",
  "ProductivityAnalysisRun",
  "ProductivityContributorStat",
  "ProductivityCommitTypeStat",
  "ProductivityWeeklyVolume",
  "ProductivityActivityBucket",
  "ProductivityAreaStat",
  "ProductivityLargeCommit",
  "ProductivityInsight",

  "QAAnalysisRun",
  "QAStatusStat",
  "QAProjectKey",
  "QAIssueEvidence",

  "GovernanceAnalysisRun",
  "GovernanceKpiStat",
  "GovernanceWorstFileStat",
  "GovernanceRiskDriver",
  "GovernanceHealthFinding",
  "GovernanceDeadCodeFinding",

  "DevOpsAccountScanRun",
  "DevOpsSeverityStat",
  "DevOpsResourceTypeStat",
  "DevOpsResourceInventory",
  "DevOpsHygieneFinding",
  "DevOpsAccountScanWarning",

  "CiRun",
  "TestCase",
  "TestCaseAlias",
  "TestExecution",
  "TestTrustState",
  "Finding",
  "Ruling",
  "Precedent",
  "StandardPattern",
  "ReleaseCertificate",
  "OverviewSnapshot",
]);

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

const WRITE_DATA_OPS = new Set(["create", "createMany", "update", "updateMany", "upsert"]);

function mergeOrgWhere(
  where: Record<string, unknown> | undefined,
  organizationId: string,
): Record<string, unknown> {
  return { ...(where ?? {}), organizationId };
}

function injectOrgIntoData(
  data: unknown,
  organizationId: string,
): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => injectOrgIntoData(row, organizationId));
  }
  if (!data || typeof data !== "object") return data;
  return { ...(data as Record<string, unknown>), organizationId };
}

/**
 * Prisma query extension that forces `organizationId` on tenant-owned models.
 * Use for session/agent-authenticated request paths.
 */
export function createTenantExtension(organizationId: string) {
  if (!organizationId.trim()) {
    throw new Error("forOrg() requires a non-empty organizationId");
  }

  return {
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (!TENANT_MODELS.has(model)) {
            return query(args);
          }

          const record = (args ?? {}) as Record<string, unknown>;

          if (READ_OPS.has(operation) || operation === "deleteMany" || operation === "delete") {
            return query({
              ...record,
              where: mergeOrgWhere(
                record.where as Record<string, unknown> | undefined,
                organizationId,
              ),
            });
          }

          if (WRITE_DATA_OPS.has(operation)) {
            const next: Record<string, unknown> = { ...record };
            if ("data" in next) {
              next.data = injectOrgIntoData(next.data, organizationId);
            }
            if ("create" in next) {
              next.create = injectOrgIntoData(next.create, organizationId);
            }
            // Updates/deletes by where must stay in-tenant
            if ("where" in next || operation === "update" || operation === "updateMany" || operation === "upsert") {
              next.where = mergeOrgWhere(
                next.where as Record<string, unknown> | undefined,
                organizationId,
              );
            }
            return query(next);
          }

          return query(args);
        },
      },
    },
  };
}

export type TenantPrismaClient = PrismaClient;
