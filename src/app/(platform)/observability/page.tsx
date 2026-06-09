import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import {
  isPrometheusTrulyConnected,
  parsePrometheusMeta,
} from "@/lib/prometheus-meta";
import { isGrafanaTrulyConnected, parseGrafanaMeta } from "@/lib/grafana-meta";
import { getAvailableMockServiceScopes } from "@/lib/observability-analysis/mock-data";
import { ObservabilityPageClient } from "@/components/observability/observability-page-client";

export default async function ObservabilityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { workspaceMode: true },
  });

  if (org?.workspaceMode === "MVP") {
    redirect("/accelerator");
  }

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

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

  return (
    <ObservabilityPageClient
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
      grafanaLastSyncedAt={grafanaLastSyncedAt}
      grafanaSnapshot={grafanaMeta?.operationalSnapshot ?? null}
      canSync={canSync}
      showP1MockPreview={showP1MockPreview}
    />
  );
}
