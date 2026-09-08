import { OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/dimensions";
import type { IntegrationsData } from "@/lib/store/types";

export const mockIntegrations: IntegrationsData = {
  items: [
    {
      id: "mock-jira",
      provider: "jira",
      status: "CONNECTED",
      lastSyncAt: OVERVIEW_LAST_SYNC_AT,
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
