import { prisma } from "@/lib/prisma";
import type {
  ComplianceFindingSeverity,
  ComplianceFindingStatus,
  ComplianceFindingView,
  ComplianceTargetType,
} from "@/lib/compliance/types";

function parseDetailJson(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function rowToComplianceFindingView(row: {
  id: string;
  ruleKey: string;
  severity: string;
  status: string;
  targetType: string;
  targetExternalId: string;
  projectKey: string | null;
  title: string;
  detailJson: string;
  entityLabel: string | null;
  entityUrl: string | null;
  repo: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
}): ComplianceFindingView {
  return {
    id: row.id,
    ruleKey: row.ruleKey,
    severity: row.severity as ComplianceFindingSeverity,
    status: row.status as ComplianceFindingStatus,
    targetType: row.targetType as ComplianceTargetType,
    targetExternalId: row.targetExternalId,
    projectKey: row.projectKey,
    title: row.title,
    detail: parseDetailJson(row.detailJson),
    entityLabel: row.entityLabel,
    entityUrl: row.entityUrl,
    repo: row.repo,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

export async function loadComplianceFindings(
  organizationId: string,
  filters?: {
    status?: ComplianceFindingStatus;
    severity?: ComplianceFindingSeverity;
    projectKey?: string;
    limit?: number;
  },
): Promise<ComplianceFindingView[]> {
  const rows = await prisma.complianceFinding.findMany({
    where: {
      organizationId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.severity ? { severity: filters.severity } : {}),
      ...(filters?.projectKey ? { projectKey: filters.projectKey } : {}),
    },
    orderBy: [{ status: "asc" }, { severity: "asc" }, { lastSeenAt: "desc" }],
    take: filters?.limit ?? 100,
  });

  return rows.map(rowToComplianceFindingView);
}
