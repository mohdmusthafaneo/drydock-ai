import type { JiraDeliverySnapshot } from "@/lib/jira-meta";
import { parseJiraMeta } from "@/lib/jira-meta";
import { prisma } from "@/lib/prisma";
import { snapshotForFilters } from "@/lib/delivery-analysis/compute-snapshot";
import type {
  DeliveryAnalysisFilters,
  DeliveryAnalysisSnapshot,
} from "@/lib/delivery-analysis/types";

export type StoredJiraDelivery = {
  snapshot: JiraDeliverySnapshot;
  siteUrl?: string;
  projectKeys: string[];
};

export async function resolveStoredJiraDelivery(
  organizationId: string,
): Promise<StoredJiraDelivery | null> {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "JIRA",
      },
    },
    select: { metadataJson: true, status: true, provider: true },
  });

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
  };
}

export function deliveryAnalysisForFilters(
  stored: StoredJiraDelivery,
  filters: DeliveryAnalysisFilters,
): DeliveryAnalysisSnapshot {
  return snapshotForFilters(stored.snapshot, stored.siteUrl, filters);
}

export function deliveryAnalysisFromMetadata(
  metadataJson: string,
  filters: DeliveryAnalysisFilters,
): DeliveryAnalysisSnapshot | null {
  const meta = parseJiraMeta(metadataJson);
  const snapshot = meta.deliverySnapshot;
  if (!snapshot?.projects?.length) {
    return null;
  }
  return snapshotForFilters(snapshot, meta.siteUrl, filters);
}
