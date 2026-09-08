import { OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/dimensions";
import { TPT_OVERVIEW_DERIVED } from "@/lib/store/mock/tpt-overview-derived";
import type { IntegrationsData } from "@/lib/store/types";

export const mockIntegrations: IntegrationsData = {
  items: [
    {
      id: "mock-jira",
      provider: "jira",
      status: "CONNECTED",
      lastSyncAt: OVERVIEW_LAST_SYNC_AT,
      projectKeys: [TPT_OVERVIEW_DERIVED.projectKey],
      siteName: TPT_OVERVIEW_DERIVED.orgName,
      mockSession: true,
    },
    {
      id: "mock-github",
      provider: "github",
      status: "CONNECTED",
      lastSyncAt: OVERVIEW_LAST_SYNC_AT,
    },
    {
      id: "mock-prometheus",
      provider: "prometheus",
      status: "CONNECTED",
      lastSyncAt: OVERVIEW_LAST_SYNC_AT,
    },
    {
      id: "mock-grafana",
      provider: "grafana",
      status: "CONNECTED",
      lastSyncAt: OVERVIEW_LAST_SYNC_AT,
    },
  ],
};
