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
import { getAppUrl, isAppUrlConfigured } from "@/lib/app-url";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IntegrationAlerts } from "@/components/integrations/integration-alerts";
import { SyncIntegrationsButton } from "@/components/integrations/integration-health-actions";
import { GitHubIntegrationPanel } from "@/components/integrations/github-integration-panel";
import { JiraIntegrationPanel } from "@/components/integrations/jira-integration-panel";
import { PrometheusIntegrationPanel } from "@/components/integrations/prometheus-integration-panel";
import { GrafanaIntegrationPanel } from "@/components/integrations/grafana-integration-panel";
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

const MVP_PROVIDERS = new Set(["GITHUB", "JIRA"]);

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
  if (!session) redirect("/login");

  const sp = await searchParams;
  const installationIdRaw = firstParam(sp.installation_id);
  const setupAction = firstParam(sp.setup_action);

  // GitHub redirects here after the org admin installs the AIDOS GitHub App.
  // Persist the installation id, then bounce to a clean URL so a refresh
  // doesn't re-run the upsert and the success alert shows up.
  if (installationIdRaw && setupAction) {
    const installationId = Number.parseInt(installationIdRaw, 10);
    if (!Number.isFinite(installationId)) {
      redirect("/integrations?error=github_app_invalid_installation");
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
      redirect("/integrations?error=github_app_persist_failed");
    }

    redirect("/integrations?connected=github_app");
  }

  const appUrl = getAppUrl();
  const githubWebhookUrl = `${appUrl}/api/webhooks/github?organizationId=${session.organizationId}`;
  const appUrlConfigured = isAppUrlConfigured();

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { workspaceMode: true },
  });

  const isMvp = org?.workspaceMode === "MVP";
  const ctx = await getOrganizationContext(session.organizationId);
  const githubAppSlug = process.env.GITHUB_APP_SLUG;
  const jiraOAuthConfigured = getJiraOAuthConfig().configured;
  const canManage = hasPermission(session, "integrations", "manage_integrations");

  const githubInstallState =
    canManage && githubAppSlug
      ? await signOAuthState({
          flow: "session",
          organizationId: session.organizationId,
          userId: session.userId,
        })
      : undefined;

  const integrations = ctx.integrations.filter(
    (i) => !isMvp || MVP_PROVIDERS.has(i.provider),
  );

  const health = await Promise.all(integrations.map((i) => checkIntegrationHealth(i)));

  return (
    <div className="space-y-8">
      <PageHeader
        title={isMvp ? "Connect your stack" : "Integration hub"}
        description={
          isMvp
            ? "Link GitHub and Jira so your MVP package flows into delivery tools."
            : "Phase 1 — GitHub App, webhooks, metadata sync, and health monitoring for your operational stack."
        }
      >
        {!isMvp && canManage && <SyncIntegrationsButton />}
      </PageHeader>

      <Suspense fallback={null}>
        <IntegrationAlerts />
      </Suspense>

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
          <code className="block break-all rounded-lg bg-elevated px-3 py-2 text-sm text-brand">
            {session.organizationId}
          </code>
        </CardContent>
      </Card>
    </div>
  );
}
