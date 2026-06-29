import type { JiraDeliverySnapshot } from "@/lib/jira-meta";
import { parseJiraMeta } from "@/lib/jira-meta";
import { prisma } from "@/lib/prisma";
import { snapshotForFilters } from "@/lib/delivery-analysis/compute-snapshot";
import type {
  DeliveryAnalysisFilters,
  DeliveryAnalysisSnapshot,
} from "@/lib/delivery-analysis/types";
import type { PortfolioJiraHygiene } from "@/lib/jira-hygiene";
import { resolveConfirmedToolchainMapping, type ToolchainMapping } from "@/lib/toolchain-mapping";

export type StoredJiraDelivery = {
  snapshot: JiraDeliverySnapshot;
  siteUrl?: string;
  projectKeys: string[];
  jiraHygiene?: PortfolioJiraHygiene;
  mapping?: ToolchainMapping;
};

export async function resolveStoredJiraDelivery(
  organizationId: string,
): Promise<StoredJiraDelivery | null> {
  const [integration, mapping] = await Promise.all([
    prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: "JIRA",
        },
      },
      select: { metadataJson: true, status: true, provider: true },
    }),
    resolveConfirmedToolchainMapping(organizationId),
  ]);

  if (!integration || integration.provider !== "JIRA") {
    return null;
  }

  const meta = parseJiraMeta(integration.metadataJson);
  const snapshot = meta.deliverySnapshot;
  if (!snapshot?.projects?.length) {
    return null;
  }

  return {
    snapshot,
    siteUrl: meta.siteUrl,
    projectKeys: meta.projectKeys ?? snapshot.projects.map((p) => p.key),
    jiraHygiene: meta.jiraHygiene,
    mapping: mapping ?? undefined,
  };
}

export function deliveryAnalysisForFilters(
  stored: StoredJiraDelivery,
  filters: DeliveryAnalysisFilters,
): DeliveryAnalysisSnapshot {
  return snapshotForFilters(
    stored.snapshot,
    stored.siteUrl,
    filters,
    stored.mapping,
    stored.jiraHygiene,
  );
}

export function deliveryAnalysisFromMetadata(
  metadataJson: string,
  filters: DeliveryAnalysisFilters,
  mapping?: ToolchainMapping,
  jiraHygiene?: PortfolioJiraHygiene,
): DeliveryAnalysisSnapshot | null {
  const meta = parseJiraMeta(metadataJson);
  const snapshot = meta.deliverySnapshot;
  if (!snapshot?.projects?.length) {
    return null;
  }
  return snapshotForFilters(
    snapshot,
    meta.siteUrl,
    filters,
    mapping,
    jiraHygiene ?? meta.jiraHygiene,
  );
}
