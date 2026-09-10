import { OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/dimensions";
import { TPT_OVERVIEW_DERIVED } from "@/lib/store/mock/tpt-overview-derived";
import type { OverviewDerivedPack } from "@/lib/store/mock/overview-derived";
import type { IntegrationsData } from "@/lib/store/types";

export function buildMockIntegrations(
  derived: OverviewDerivedPack,
): IntegrationsData {
  const lastSyncAt = derived.lastSyncAt || OVERVIEW_LAST_SYNC_AT;
  return {
    items: [
      {
        id: "mock-jira",
        provider: "jira",
        status: "CONNECTED",
        lastSyncAt,
        projectKeys: [derived.projectKey],
        siteName: derived.orgName,
        siteUrl: derived.jiraSiteUrl,
        mockSession: true,
      },
      {
        id: "mock-github",
        provider: "github",
        status: "CONNECTED",
        lastSyncAt,
      },
      {
        id: "mock-prometheus",
        provider: "prometheus",
        status: "CONNECTED",
        lastSyncAt,
      },
      {
        id: "mock-grafana",
        provider: "grafana",
        status: "CONNECTED",
        lastSyncAt,
      },
    ],
  };
}

export const mockIntegrations: IntegrationsData = buildMockIntegrations(
  TPT_OVERVIEW_DERIVED as unknown as OverviewDerivedPack,
);
