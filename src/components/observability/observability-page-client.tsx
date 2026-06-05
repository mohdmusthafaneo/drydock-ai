"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ObservabilityDashboard } from "@/components/observability/observability-dashboard";
import {
  ConnectPrometheusEmpty,
  SelectScopesEmpty,
  SyncPrometheusEmpty,
} from "@/components/observability/connect-prometheus-empty";

type Props = {
  prometheusConnected: boolean;
  isStubConnection: boolean;
  serviceScopes: Array<{ id: string; label: string }>;
  hasSnapshot: boolean;
  lastSyncedAt: string | null;
  canSync: boolean;
  /** P1: show mock dashboard when stub connected for UI shell preview */
  showP1MockPreview: boolean;
};

export function ObservabilityPageClient({
  prometheusConnected,
  isStubConnection,
  serviceScopes,
  hasSnapshot,
  lastSyncedAt,
  canSync,
  showP1MockPreview,
}: Props) {
  const serviceIds = serviceScopes.map((s) => s.id);

  return (
    <div className="w-full space-y-8 pb-24 lg:pb-8">
      <PageHeader
        title="Observability center"
        description="See error rates, latency, resource pressure, and alert signals from Prometheus — so leaders can govern operational health with evidence, not dashboard hopping."
      />

      {!prometheusConnected && !showP1MockPreview ? (
        <ConnectPrometheusEmpty />
      ) : isStubConnection && !showP1MockPreview ? (
        <ConnectPrometheusEmpty />
      ) : serviceScopes.length === 0 ? (
        <SelectScopesEmpty />
      ) : !hasSnapshot && !showP1MockPreview ? (
        <SyncPrometheusEmpty serviceScopes={serviceScopes} />
      ) : (
        <ObservabilityDashboard
          serviceIds={serviceIds.length > 0 ? serviceIds : ["api-gateway", "web-client"]}
          lastSyncedAt={lastSyncedAt}
          canSync={canSync}
          isMockData={showP1MockPreview || !hasSnapshot}
        />
      )}
    </div>
  );
}
