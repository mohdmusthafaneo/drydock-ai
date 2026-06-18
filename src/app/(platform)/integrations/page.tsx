import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { getJiraOAuthConfig } from "@/lib/jira-oauth";
import { parseJiraMeta } from "@/lib/jira-meta";
import { checkIntegrationHealth } from "@/lib/integration-health";
import { persistGitHubAppInstallation } from "@/lib/github-app-install";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { signOAuthState } from "@/lib/oauth-state";
import { appPath, getAppUrl, isAppUrlConfigured } from "@/lib/app-url";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IntegrationAlerts } from "@/components/integrations/integration-alerts";
import { SyncIntegrationsButton } from "@/components/integrations/integration-health-actions";
import { GitHubIntegrationPanel } from "@/components/integrations/github-integration-panel";
import { JiraIntegrationPanel } from "@/components/integrations/jira-integration-panel";
import { PrometheusIntegrationPanel } from "@/components/integrations/prometheus-integration-panel";
import { GrafanaIntegrationPanel } from "@/components/integrations/grafana-integration-panel";
import { ObservabilityPairingBanner } from "@/components/integrations/observability-pairing-banner";
import { isPrometheusTrulyConnected, parsePrometheusMeta } from "@/lib/prometheus-meta";
import { isGrafanaTrulyConnected, parseGrafanaMeta } from "@/lib/grafana-meta";
import { DisconnectButton, StubConnectButton } from "@/components/integrations/integration-actions";

const PROVIDER_LABELS: Record<string, string> = {
  GITHUB: "GitHub",
  JIRA: "Jira",
  JENKINS: "Jenkins",
  GRAFANA: "Grafana",
  PROMETHEUS: "Prometheus",
  SLACK: "Slack",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect(appPath("/login"));

  const sp = await searchParams;
  const installationIdRaw = firstParam(sp.installation_id);
  const setupAction = firstParam(sp.setup_action);

  // GitHub redirects here after the org admin installs the AIDOS GitHub App.
  // Persist the installation id, then bounce to a clean URL so a refresh
  // doesn't re-run the upsert and the success alert shows up.
  if (installationIdRaw && setupAction) {
    const installationId = Number.parseInt(installationIdRaw, 10);
    if (!Number.isFinite(installationId)) {
      redirect(appPath("/integrations?error=github_app_invalid_installation"));
    }

    try {
      await persistGitHubAppInstallation({
        organizationId: session.organizationId,
        userId: session.userId,
        installationId,
        setupAction,
      });
    } catch (err) {
      console.error("[integrations] persistGitHubAppInstallation failed:", err);
      redirect(appPath("/integrations?error=github_app_persist_failed"));
    }

    redirect(appPath("/integrations?connected=github_app"));
  }

  const appUrl = getAppUrl();
  const githubWebhookUrl = `${appUrl}/api/webhooks/github?organizationId=${session.organizationId}`;
  const grafanaWebhookUrl = `${appUrl}/api/webhooks/grafana?organizationId=${session.organizationId}`;
  const appUrlConfigured = isAppUrlConfigured();

  const ctx = await getOrganizationContext(session.organizationId);
  const githubAppSlug = process.env.GITHUB_APP_SLUG;
  const jiraOAuthConfigured = getJiraOAuthConfig().configured;
  const canManage = hasPermission(session, "integrations", "manage_integrations");

  const grafanaIntegration = ctx.integrations.find((i) => i.provider === "GRAFANA");
  const prometheusIntegration = ctx.integrations.find((i) => i.provider === "PROMETHEUS");
  const grafanaMetaForBanner = grafanaIntegration
    ? parseGrafanaMeta(grafanaIntegration.metadataJson)
    : null;
  const showObservabilityBanner =
    isGrafanaTrulyConnected(grafanaIntegration) || isPrometheusTrulyConnected(prometheusIntegration);

  const githubInstallState =
    canManage && githubAppSlug
      ? await signOAuthState({
          flow: "session",
          organizationId: session.organizationId,
          userId: session.userId,
        })
      : undefined;

  const integrations = ctx.integrations;

  const health = await Promise.all(integrations.map((i) => checkIntegrationHealth(i)));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Integration hub"
        description="Phase 1 — GitHub App, webhooks, metadata sync, and health monitoring for your operational stack."
      >
        {canManage && <SyncIntegrationsButton />}
      </PageHeader>

      <Suspense fallback={null}>
        <IntegrationAlerts />
      </Suspense>

      {showObservabilityBanner && (
        <ObservabilityPairingBanner
          grafanaTrulyConnected={isGrafanaTrulyConnected(grafanaIntegration)}
          grafanaProxyConfigured={Boolean(grafanaMetaForBanner?.prometheusDatasource?.uid)}
          grafanaDatasourceName={grafanaMetaForBanner?.prometheusDatasource?.name}
          prometheusTrulyConnected={isPrometheusTrulyConnected(prometheusIntegration)}
          metricsProvenance={grafanaMetaForBanner?.metricsProvenance}
        />
      )}

      {!githubAppSlug && (
        <Card className="border-warning/30 bg-warning-muted/50">
          <CardHeader>
            <CardTitle className="text-base">GitHub App setup required</CardTitle>
            <CardDescription>
              Set <code>GITHUB_APP_SLUG</code> in <code>.env</code> (e.g.{" "}
              <code>aidos-neo</code>) so org admins can install the AIDOS GitHub App.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration, idx) => {
          const meta = parseIntegrationMeta(integration.metadataJson);
          const jiraMeta = parseJiraMeta(integration.metadataJson);
          const h = health[idx];
          const isGitHub = integration.provider === "GITHUB";
          const isJira = integration.provider === "JIRA";
          const isPrometheus = integration.provider === "PROMETHEUS";
          const isGrafana = integration.provider === "GRAFANA";
          const prometheusMeta = isPrometheus
            ? parsePrometheusMeta(integration.metadataJson)
            : null;
          const grafanaMeta = isGrafana ? parseGrafanaMeta(integration.metadataJson) : null;
          const isConnected = integration.status === "CONNECTED";

          return (
            <Card key={integration.id} className={isGitHub ? "md:col-span-2 xl:col-span-2" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    {PROVIDER_LABELS[integration.provider] || integration.provider}
                  </CardTitle>
                  <Badge variant={h.healthy ? "success" : isConnected ? "warning" : "muted"}>
                    {h.healthy ? "Healthy" : integration.status}
                  </Badge>
                </div>
                <CardDescription>{h.message}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {h.lastSyncAt && (
                  <p className="text-xs text-muted">Last sync: {h.lastSyncAt.toLocaleString()}</p>
                )}

                {isGitHub ? (
                  <GitHubIntegrationPanel
                    connected={isConnected}
                    lastSyncSummary={meta.lastSyncSummary}
                    repos={meta.repos}
                    selectedRepoFullNames={meta.repoFullNames}
                    webhookUrl={githubWebhookUrl}
                    webhookEnabled={integration.webhookEnabled}
                    appSlug={githubAppSlug}
                    installationId={meta.installationId}
                    installedAt={meta.installedAt}
                    canManage={canManage}
                    installState={githubInstallState}
                    appUrlConfigured={appUrlConfigured}
                  />
                ) : isJira ? (
                  <JiraIntegrationPanel
                    connected={isConnected}
                    configured={jiraOAuthConfigured}
                    siteName={jiraMeta.siteName}
                    siteUrl={jiraMeta.siteUrl}
                    displayName={jiraMeta.displayName}
                    connectedAt={integration.connectedAt?.toISOString()}
                    connectionStatus={jiraMeta.connectionStatus}
                    lastError={jiraMeta.lastError ?? integration.lastError ?? undefined}
                    lastSyncSummary={jiraMeta.lastSyncSummary}
                    selectedProjectKeys={jiraMeta.projectKeys}
                    deliverySnapshot={jiraMeta.deliverySnapshot}
                    availableSitesCount={jiraMeta.availableSites?.length}
                    canManage={canManage}
                    appUrlConfigured={appUrlConfigured}
                  />
                ) : isPrometheus ? (
                  <PrometheusIntegrationPanel
                    connected={isConnected}
                    trulyConnected={isPrometheusTrulyConnected(integration)}
                    prometheusUrl={prometheusMeta?.prometheusUrl}
                    authType={prometheusMeta?.authType}
                    basicUsername={prometheusMeta?.basicUsername}
                    connectedAt={integration.connectedAt?.toISOString()}
                    connectionStatus={prometheusMeta?.connectionStatus}
                    lastError={prometheusMeta?.lastError ?? integration.lastError ?? undefined}
                    lastSyncSummary={prometheusMeta?.lastSyncSummary}
                    selectedServiceScopes={prometheusMeta?.serviceScopes}
                    grafanaProxyActive={Boolean(
                      parseGrafanaMeta(
                        ctx.integrations.find((i) => i.provider === "GRAFANA")?.metadataJson ?? "{}",
                      ).prometheusDatasource?.uid,
                    )}
                    grafanaProxyDatasourceName={
                      parseGrafanaMeta(
                        ctx.integrations.find((i) => i.provider === "GRAFANA")?.metadataJson ?? "{}",
                      ).prometheusDatasource?.name
                    }
                    canManage={canManage}
                  />
                ) : isGrafana ? (
                  <GrafanaIntegrationPanel
                    connected={isConnected}
                    trulyConnected={isGrafanaTrulyConnected(integration)}
                    grafanaUrl={grafanaMeta?.grafanaUrl}
                    authType={grafanaMeta?.authType}
                    connectedAt={integration.connectedAt?.toISOString()}
                    connectionStatus={grafanaMeta?.connectionStatus}
                    lastError={grafanaMeta?.lastError ?? integration.lastError ?? undefined}
                    lastSyncSummary={grafanaMeta?.lastSyncSummary}
                    selectedDashboardScopes={grafanaMeta?.dashboardScopes}
                    operationalSnapshot={grafanaMeta?.operationalSnapshot}
                    prometheusDatasource={grafanaMeta?.prometheusDatasource}
                    metricsServiceScopes={grafanaMeta?.metricsServiceScopes}
                    metricsLastSyncSummary={grafanaMeta?.metricsLastSyncSummary}
                    metricsSnapshot={grafanaMeta?.metricsSnapshot}
                    metricsLastError={grafanaMeta?.metricsLastError}
                    webhookUrl={
                      grafanaMeta?.webhookSecret
                        ? `${grafanaWebhookUrl}&secret=${grafanaMeta.webhookSecret}`
                        : grafanaWebhookUrl
                    }
                    webhookSecret={grafanaMeta?.webhookSecret}
                    webhookEnabled={integration.webhookEnabled}
                    appUrlConfigured={appUrlConfigured}
                    canManage={canManage}
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {integration.webhookEnabled && <Badge variant="brand">Webhooks active</Badge>}
                    {!isConnected && <StubConnectButton provider={integration.provider} />}
                    {isConnected && canManage && (
                      <DisconnectButton provider={integration.provider} />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border-subtle">
        <CardHeader>
          <CardTitle className="text-base">Your organization ID</CardTitle>
          <CardDescription>Required for GitHub webhook URL</CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block break-all rounded-2xl bg-fog px-3 py-2 text-sm text-chart-blue">
            {session.organizationId}
          </code>
        </CardContent>
      </Card>
    </div>
  );
}
