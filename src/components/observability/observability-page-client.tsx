"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ObservabilityDashboard } from "@/components/observability/observability-dashboard";
import { GrafanaObservabilityDashboard } from "@/components/observability/grafana-observability-dashboard";
import {
  ConnectPrometheusEmpty,
  SelectScopesEmpty,
  SyncPrometheusEmpty,
} from "@/components/observability/connect-prometheus-empty";
import {
  ConnectGrafanaEmpty,
  ConnectObservabilityEmpty,
  SelectGrafanaScopesEmpty,
  SyncGrafanaEmpty,
} from "@/components/observability/connect-grafana-empty";
import { GrafanaProxyMetricsStrip } from "@/components/observability/grafana-proxy-metrics-strip";
import type { GrafanaOperationalSnapshot } from "@/lib/grafana-meta";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import type { MetricsProvenance } from "@/lib/observability-metrics/types";
import { cn } from "@/lib/utils";

type SourceTab = "prometheus" | "grafana";

type Props = {
  prometheusConnected: boolean;
  prometheusTrulyConnected: boolean;
  isPrometheusStub: boolean;
  serviceScopes: Array<{ id: string; label: string }>;
  prometheusHasSnapshot: boolean;
  prometheusLastSyncedAt: string | null;
  grafanaConnected: boolean;
  grafanaTrulyConnected: boolean;
  grafanaDashboardScopes: Array<{ title: string }>;
  grafanaHasSnapshot: boolean;
  grafanaHasMetricsSnapshot: boolean;
  grafanaMetricsSnapshot: ObservabilityAnalysisSnapshot | null;
  grafanaMetricsProvenance: MetricsProvenance | null;
  grafanaLastSyncedAt: string | null;
  grafanaSnapshot: GrafanaOperationalSnapshot | null;
  canSync: boolean;
  showP1MockPreview: boolean;
};

export function ObservabilityPageClient({
  prometheusConnected,
  prometheusTrulyConnected,
  isPrometheusStub,
  serviceScopes,
  prometheusHasSnapshot,
  prometheusLastSyncedAt,
  grafanaConnected,
  grafanaTrulyConnected,
  grafanaDashboardScopes,
  grafanaHasSnapshot,
  grafanaHasMetricsSnapshot,
  grafanaMetricsSnapshot,
  grafanaMetricsProvenance,
  grafanaLastSyncedAt,
  grafanaSnapshot,
  canSync,
  showP1MockPreview,
}: Props) {
  const hasPrometheusView = prometheusTrulyConnected || showP1MockPreview;
  const hasGrafanaView = grafanaTrulyConnected;
  const bothConnected = hasPrometheusView && hasGrafanaView;

  const defaultTab: SourceTab = hasPrometheusView ? "prometheus" : "grafana";
  const [activeTab, setActiveTab] = useState<SourceTab>(defaultTab);

  const description = bothConnected
    ? "Prometheus metric KPIs and Grafana alert/dashboard coverage — side-by-side sources for operational governance."
    : hasGrafanaView
      ? "Firing alerts, dashboard coverage, and annotation signals from Grafana — govern observability health with evidence."
      : "See error rates, latency, resource pressure, and alert signals from Prometheus — so leaders can govern operational health with evidence, not dashboard hopping.";

  const neitherConnected =
    !prometheusConnected && !grafanaConnected && !showP1MockPreview;

  function renderPrometheusContent() {
    if (!prometheusConnected && !showP1MockPreview) {
      return <ConnectPrometheusEmpty />;
    }
    if (isPrometheusStub && !showP1MockPreview) {
      return <ConnectPrometheusEmpty />;
    }
    if (serviceScopes.length === 0) {
      return <SelectScopesEmpty />;
    }
    if (!prometheusHasSnapshot && !showP1MockPreview) {
      return <SyncPrometheusEmpty serviceScopes={serviceScopes} />;
    }
    return (
      <ObservabilityDashboard
        serviceIds={
          serviceScopes.length > 0
            ? serviceScopes.map((s) => s.id)
            : ["api-gateway", "web-client"]
        }
        lastSyncedAt={prometheusLastSyncedAt}
        canSync={canSync}
        isMockData={showP1MockPreview || !prometheusHasSnapshot}
      />
    );
  }

  function renderGrafanaContent() {
    if (!grafanaTrulyConnected) {
      return <ConnectGrafanaEmpty />;
    }
    if (grafanaDashboardScopes.length === 0 && !grafanaHasMetricsSnapshot) {
      return <SelectGrafanaScopesEmpty />;
    }
    if (!grafanaHasSnapshot && !grafanaHasMetricsSnapshot) {
      return <SyncGrafanaEmpty dashboardScopes={grafanaDashboardScopes} />;
    }

    return (
      <div className="space-y-8">
        {grafanaHasMetricsSnapshot && grafanaMetricsSnapshot && (
          <GrafanaProxyMetricsStrip
            snapshot={grafanaMetricsSnapshot}
            provenance={grafanaMetricsProvenance}
            lastSyncedAt={grafanaLastSyncedAt}
          />
        )}
        {grafanaHasSnapshot && grafanaSnapshot ? (
          <GrafanaObservabilityDashboard
            snapshot={grafanaSnapshot}
            lastSyncedAt={grafanaLastSyncedAt}
            canSync={canSync}
          />
        ) : grafanaHasMetricsSnapshot ? null : (
          <p className="text-sm text-muted">
            Select a Prometheus datasource on Integrations to load metric KPIs via Grafana.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 pb-24 lg:pb-8">
      <PageHeader title="Observability center" description={description} />

      {neitherConnected ? (
        <ConnectObservabilityEmpty />
      ) : bothConnected ? (
        <>
          <div className="flex gap-1 rounded-lg border border-border bg-elevated/40 p-1">
            <TabButton
              active={activeTab === "prometheus"}
              onClick={() => setActiveTab("prometheus")}
            >
              Metrics (Prometheus)
            </TabButton>
            <TabButton
              active={activeTab === "grafana"}
              onClick={() => setActiveTab("grafana")}
            >
              Alerts & dashboards (Grafana)
            </TabButton>
          </div>
          {activeTab === "prometheus" ? renderPrometheusContent() : renderGrafanaContent()}
        </>
      ) : hasGrafanaView ? (
        renderGrafanaContent()
      ) : (
        renderPrometheusContent()
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-base text-primary shadow-sm"
          : "text-muted hover:text-secondary",
      )}
    >
      {children}
    </button>
  );
}
