import type { Integration } from "@/generated/prisma/client";
import {
  isGrafanaTrulyConnected,
  parseGrafanaMeta,
  type GrafanaOperationalSnapshot,
} from "@/lib/grafana-meta";

export type GrafanaAssessContext = {
  connected: boolean;
  synced: boolean;
  snapshot: GrafanaOperationalSnapshot | null;
  openAlerts: number;
};

export function resolveGrafanaAssessContext(input: {
  integrations: Integration[];
}): GrafanaAssessContext {
  const grafana = input.integrations.find((i) => i.provider === "GRAFANA");

  if (!grafana || !isGrafanaTrulyConnected(grafana)) {
    return { connected: false, synced: false, snapshot: null, openAlerts: 0 };
  }

  const meta = parseGrafanaMeta(grafana.metadataJson);
  const snapshot = meta.operationalSnapshot ?? null;

  if (!snapshot) {
    return { connected: true, synced: false, snapshot: null, openAlerts: 0 };
  }

  return {
    connected: true,
    synced: true,
    snapshot,
    openAlerts: snapshot.kpis.openAlerts,
  };
}
