import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { hasPermission } from "@/lib/rbac";
import {
  buildObservabilityFreshness,
  buildObservabilityStabilitySummary,
} from "@/lib/governance/presentation";
import {
  isPrometheusTrulyConnected,
  parsePrometheusMeta,
} from "@/lib/prometheus-meta";
import { isGrafanaTrulyConnected, parseGrafanaMeta } from "@/lib/grafana-meta";
import { getAvailableMockServiceScopes } from "@/lib/observability-analysis/mock-data";
import { ObservabilityPageClient } from "@/components/observability/observability-page-client";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import { isObservabilityEnabled } from "@/lib/process-role";

export default async function ObservabilityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!isObservabilityEnabled()) redirect("/briefing");

  const ctx = await getOrganizationContext(session.organizationId);

  const prometheus = ctx.integrations.find(
    (i) => i.provider === "PROMETHEUS" && i.status === "CONNECTED",
  );
  const grafana = ctx.integrations.find(
    (i) => i.provider === "GRAFANA" && i.status === "CONNECTED",
  );

  const prometheusMeta = prometheus ? parsePrometheusMeta(prometheus.metadataJson) : null;
  const grafanaMeta = grafana ? parseGrafanaMeta(grafana.metadataJson) : null;

  const prometheusConnected = Boolean(prometheus);
  const grafanaConnected = Boolean(grafana);
  const prometheusTrulyConnected = isPrometheusTrulyConnected(prometheus);
  const grafanaTrulyConnected = isGrafanaTrulyConnected(grafana);

  const isPrometheusStub = prometheusMeta?.mode === "observability-stub";
  const prometheusHasSnapshot = Boolean(prometheusMeta?.operationalSnapshot);
  const prometheusLastSyncedAt = prometheus?.lastSyncAt?.toISOString() ?? null;

  const grafanaHasSnapshot = Boolean(grafanaMeta?.operationalSnapshot);
  const grafanaMetricsSnapshot = (grafanaMeta?.metricsSnapshot as ObservabilityAnalysisSnapshot | undefined) ?? null;
  const grafanaHasMetricsSnapshot = Boolean(grafanaMetricsSnapshot?.kpis);
  const grafanaMetricsProvenance = grafanaMeta?.metricsProvenance ?? null;
  const grafanaLastSyncedAt = grafana?.lastSyncAt?.toISOString() ?? null;
  const grafanaDashboardScopes = grafanaMeta?.dashboardScopes ?? [];

  const canSync = hasPermission(session, "integrations", "manage_integrations");

  const configuredScopes = prometheusMeta?.serviceScopes ?? [];

  const showP1MockPreview =
    (isPrometheusStub && prometheusConnected) ||
    (prometheusTrulyConnected && configuredScopes.length > 0 && !prometheusHasSnapshot);

  const serviceScopes =
    configuredScopes.length > 0
      ? configuredScopes
      : showP1MockPreview && isPrometheusStub
        ? getAvailableMockServiceScopes()
        : [];

  const stability = buildObservabilityStabilitySummary(ctx);
  const freshness = buildObservabilityFreshness(ctx.integrations);

  return (
    <ObservabilityPageClient
      stability={stability}
      freshness={freshness}
      openIncidents={ctx.stats.openIncidents}
      prometheusConnected={prometheusConnected}
      prometheusTrulyConnected={prometheusTrulyConnected}
      isPrometheusStub={isPrometheusStub}
      serviceScopes={serviceScopes}
      prometheusHasSnapshot={prometheusHasSnapshot}
      prometheusLastSyncedAt={prometheusLastSyncedAt}
      grafanaConnected={grafanaConnected}
      grafanaTrulyConnected={grafanaTrulyConnected}
      grafanaDashboardScopes={grafanaDashboardScopes}
      grafanaHasSnapshot={grafanaHasSnapshot}
      grafanaHasMetricsSnapshot={grafanaHasMetricsSnapshot}
      grafanaMetricsSnapshot={grafanaMetricsSnapshot}
      grafanaMetricsProvenance={grafanaMetricsProvenance}
      grafanaLastSyncedAt={grafanaLastSyncedAt}
      grafanaSnapshot={grafanaMeta?.operationalSnapshot ?? null}
      canSync={canSync}
      showP1MockPreview={showP1MockPreview}
    />
  );
}
