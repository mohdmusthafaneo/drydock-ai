import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { getJiraOAuthConfig } from "@/lib/jira-oauth";
import { parseJiraMeta } from "@/lib/jira-meta";
import { fetchOrgJiraProjects } from "@/lib/jira-project-selection";
import {
  checkIntegrationHealth,
  summarizeIntegrationHealth,
  type IntegrationHealthSummary,
} from "@/lib/integration-health";
import { persistGitHubAppInstallation } from "@/lib/github-app-install";
import { hasPermission } from "@/lib/rbac";
import { signOAuthState } from "@/lib/oauth-state";
import { appPath, getAppUrl, isAppUrlConfigured } from "@/lib/app-url";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IntegrationAlerts } from "@/components/integrations/integration-alerts";
import { ConnectHandoffBanner } from "@/components/integrations/connect-handoff-banner";
import { SyncIntegrationsButton } from "@/components/integrations/integration-health-actions";
import { GitHubIntegrationPanel } from "@/components/integrations/github-integration-panel";
import { JiraIntegrationPanel } from "@/components/integrations/jira-integration-panel";
import { SlackIntegrationPanel } from "@/components/integrations/slack-integration-panel";
import { PrometheusIntegrationPanel } from "@/components/integrations/prometheus-integration-panel";
import { GrafanaIntegrationPanel } from "@/components/integrations/grafana-integration-panel";
import { ObservabilityPairingBanner } from "@/components/integrations/observability-pairing-banner";
import { isPrometheusTrulyConnected, parsePrometheusMeta } from "@/lib/prometheus-meta";
import { isGrafanaTrulyConnected, parseGrafanaMeta } from "@/lib/grafana-meta";
import { getSlackOAuthConfig } from "@/lib/slack-oauth";
import { parseSlackMeta } from "@/lib/slack-meta";
import { IntegrationHealthSummaryStrip } from "@/components/integrations/integration-health-summary";
import { RevealSection } from "@/components/motion/reveal-section";
import { DisconnectButton, StubConnectButton } from "@/components/integrations/integration-actions";
import { AwsIntegrationPanel } from "@/components/integrations/aws-integration-panel";
import {
  isAwsTrulyConnected,
  maskExternalId,
  parseAwsMeta,
} from "@/lib/aws-meta";
import { ensureAwsIntegrationRow } from "@/lib/ensure-aws-integration";
import { ensureSlackIntegrationRow } from "@/lib/ensure-slack-integration";
import { decryptToken } from "@/lib/token-crypto";
import { ConnectorConfigureDisclosure } from "@/components/integrations/connector-configure-disclosure";
import { MoreConnectorsSection } from "@/components/integrations/more-connectors-section";

const PROVIDER_LABELS: Record<string, string> = {
  GITHUB: "GitHub",
  JIRA: "Jira",
  JENKINS: "Jenkins",
  GRAFANA: "Grafana",
  PROMETHEUS: "Prometheus",
  SLACK: "Slack",
  AWS: "AWS",
};

const PRIMARY_ORDER = ["GITHUB", "JIRA", "SLACK"] as const;
const OBSERVABILITY_ORDER = ["GRAFANA", "PROMETHEUS"] as const;
const MORE_PROVIDERS = new Set(["JENKINS"]);

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type IntegrationRow = Awaited<
  ReturnType<typeof getOrganizationContext>
>["integrations"][number];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pickByProvider(
  integrations: IntegrationRow[],
  providers: readonly string[],
): IntegrationRow[] {
  return providers
    .map((p) => integrations.find((i) => i.provider === p))
    .filter((i): i is IntegrationRow => Boolean(i));
}

function SectionHeading({
  step,
  title,
  description,
}: {
  step?: number;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {step != null && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-semibold text-secondary">
            {step}
          </span>
        )}
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
      </div>
      <p className="text-xs text-muted">{description}</p>
    </div>
  );
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
  const handoff = firstParam(sp.handoff);
  const connectedParam = firstParam(sp.connected);

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

    redirect(appPath("/integrations?connected=github_app&handoff=1"));
  }

  const appUrl = getAppUrl();
  const githubWebhookUrl = `${appUrl}/api/webhooks/github?organizationId=${session.organizationId}`;
  const grafanaWebhookUrl = `${appUrl}/api/webhooks/grafana?organizationId=${session.organizationId}`;
  const slackWebhookUrl = `${appUrl}/api/webhooks/slack`;
  const appUrlConfigured = isAppUrlConfigured();

  await ensureAwsIntegrationRow(session.organizationId);
  await ensureSlackIntegrationRow(session.organizationId);
  const ctx = await getOrganizationContext(session.organizationId);
  const githubAppSlug = process.env.GITHUB_APP_SLUG;
  const trustedAwsAccountId = process.env.TRUSTED_AWS_ACCOUNT_ID?.trim() || null;
  const jiraOAuthConfigured = getJiraOAuthConfig().configured;
  const slackOAuthConfigured = getSlackOAuthConfig().configured;
  const canManage = hasPermission(session, "integrations", "manage_integrations");
  const isDev = process.env.NODE_ENV === "development";

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
  const healthSummary = summarizeIntegrationHealth(health);
  const healthById = new Map(integrations.map((i, idx) => [i.id, health[idx]]));

  const jiraIntegration = integrations.find((i) => i.provider === "JIRA");
  const jiraConnected = jiraIntegration?.status === "CONNECTED";
  let jiraProjectOptions: Array<{ key: string; name: string }> = [];
  let jiraProjectLoadError: string | undefined;
  if (jiraConnected && hasPermission(session, "integrations", "view")) {
    try {
      const { projects } = await fetchOrgJiraProjects(session.organizationId);
      jiraProjectOptions = projects;
    } catch (e) {
      jiraProjectLoadError =
        e instanceof Error ? e.message : "Failed to load Jira projects";
    }
  }

  const panelCtx = {
    canManage,
    githubAppSlug,
    githubInstallState,
    githubWebhookUrl,
    grafanaWebhookUrl,
    slackWebhookUrl,
    appUrlConfigured,
    jiraOAuthConfigured,
    slackOAuthConfigured,
    jiraProjectOptions,
    jiraProjectLoadError,
    trustedAwsAccountId,
    integrations,
    isDev,
  };

  function renderCard(integration: IntegrationRow, opts?: { spanWide?: boolean }) {
    const h = healthById.get(integration.id);
    if (!h) return null;
    return (
      <IntegrationConnectorCard
        key={integration.id}
        integration={integration}
        health={h}
        spanWide={opts?.spanWide}
        {...panelCtx}
      />
    );
  }

  const primary = pickByProvider(integrations, PRIMARY_ORDER);
  const observability = pickByProvider(integrations, OBSERVABILITY_ORDER);
  const aws = integrations.find((i) => i.provider === "AWS");
  const more = integrations.filter((i) => MORE_PROVIDERS.has(i.provider));
  const leftovers = integrations.filter(
    (i) =>
      !PRIMARY_ORDER.includes(i.provider as (typeof PRIMARY_ORDER)[number]) &&
      !OBSERVABILITY_ORDER.includes(i.provider as (typeof OBSERVABILITY_ORDER)[number]) &&
      i.provider !== "AWS" &&
      !MORE_PROVIDERS.has(i.provider),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Connect"
        description="Connect the systems AIDOS needs for a trustworthy briefing."
      >
        {canManage && <SyncIntegrationsButton />}
      </PageHeader>

      {handoff === "1" && <ConnectHandoffBanner connected={connectedParam} />}

      {integrations.length > 0 && (
        <RevealSection>
          <IntegrationHealthSummaryStrip summary={healthSummary} />
        </RevealSection>
      )}

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

      {!githubAppSlug && canManage && (
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

      <div id="integration-grid" className="space-y-8">
        <section className="space-y-4">
          <SectionHeading
            step={1}
            title="Source control"
            description="Start with GitHub so AIDOS can read repos, PRs, and delivery signals."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {primary
              .filter((i) => i.provider === "GITHUB")
              .map((i) => renderCard(i, { spanWide: true }))}
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading
            step={2}
            title="Delivery tracking"
            description="Connect Jira for work items, cycle time, and release context."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {primary.filter((i) => i.provider === "JIRA").map((i) => renderCard(i))}
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading
            step={3}
            title="Team chat"
            description="Install Slack so org members can ask the AIDOS assistant read-only questions from channels and DMs."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {primary.filter((i) => i.provider === "SLACK").map((i) => renderCard(i))}
          </div>
        </section>

        {observability.length > 0 && (
          <section className="space-y-4">
            <SectionHeading
              step={4}
              title="Observability"
              description="Grafana and Prometheus for runtime health and release confidence."
            />
            <div className="grid gap-4 md:grid-cols-2">
              {observability.map((i) => renderCard(i))}
            </div>
          </section>
        )}

        {aws && (
          <section className="space-y-4">
            <SectionHeading
              step={5}
              title="Cloud"
              description="AWS assume-role access for inventory and cloud hygiene scans."
            />
            <div className="grid gap-4 md:grid-cols-2">{renderCard(aws)}</div>
          </section>
        )}

        <MoreConnectorsSection count={more.length}>
          {more.map((i) => renderCard(i))}
        </MoreConnectorsSection>

        {leftovers.length > 0 && (
          <section className="space-y-4">
            <SectionHeading title="Other" description="Additional connectors for this organization." />
            <div className="grid gap-4 md:grid-cols-2">
              {leftovers.map((i) => renderCard(i))}
            </div>
          </section>
        )}
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

function IntegrationConnectorCard({
  integration,
  health: h,
  spanWide,
  canManage,
  githubAppSlug,
  githubInstallState,
  githubWebhookUrl,
  grafanaWebhookUrl,
  slackWebhookUrl,
  appUrlConfigured,
  jiraOAuthConfigured,
  slackOAuthConfigured,
  jiraProjectOptions,
  jiraProjectLoadError,
  trustedAwsAccountId,
  integrations,
  isDev,
}: {
  integration: IntegrationRow;
  health: IntegrationHealthSummary;
  spanWide?: boolean;
  canManage: boolean;
  githubAppSlug: string | undefined;
  githubInstallState: string | undefined;
  githubWebhookUrl: string;
  grafanaWebhookUrl: string;
  slackWebhookUrl: string;
  appUrlConfigured: boolean;
  jiraOAuthConfigured: boolean;
  slackOAuthConfigured: boolean;
  jiraProjectOptions: Array<{ key: string; name: string }>;
  jiraProjectLoadError: string | undefined;
  trustedAwsAccountId: string | null;
  integrations: IntegrationRow[];
  isDev: boolean;
}) {
  const meta = parseIntegrationMeta(integration.metadataJson);
  const jiraMeta = parseJiraMeta(integration.metadataJson);
  const slackMeta = parseSlackMeta(integration.metadataJson);
  const isGitHub = integration.provider === "GITHUB";
  const isJira = integration.provider === "JIRA";
  const isSlack = integration.provider === "SLACK";
  const isPrometheus = integration.provider === "PROMETHEUS";
  const isGrafana = integration.provider === "GRAFANA";
  const isAws = integration.provider === "AWS";
  const prometheusMeta = isPrometheus ? parsePrometheusMeta(integration.metadataJson) : null;
  const grafanaMeta = isGrafana ? parseGrafanaMeta(integration.metadataJson) : null;
  const awsMeta = isAws ? parseAwsMeta(integration.metadataJson) : null;
  let awsExternalIdMasked: string | undefined;
  if (awsMeta?.externalIdEnc) {
    try {
      awsExternalIdMasked = maskExternalId(decryptToken(awsMeta.externalIdEnc));
    } catch {
      awsExternalIdMasked = "••••";
    }
  }
  const isConnected = integration.status === "CONNECTED";
  const grafanaParsed = parseGrafanaMeta(
    integrations.find((i) => i.provider === "GRAFANA")?.metadataJson ?? "{}",
  );

  const prometheusTruly = isPrometheusTrulyConnected(integration);
  const grafanaTruly = isGrafanaTrulyConnected(integration);
  const awsTruly = isAwsTrulyConnected(integration);

  let body: ReactNode;

  if (isGitHub) {
    body = (
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
    );
  } else if (isJira) {
    body = (
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
        initialProjects={jiraProjectOptions}
        initialProjectLoadError={jiraProjectLoadError}
        canManage={canManage}
        appUrlConfigured={appUrlConfigured}
      />
    );
  } else if (isSlack) {
    body = (
      <SlackIntegrationPanel
        connected={isConnected}
        configured={slackOAuthConfigured}
        teamName={slackMeta.teamName}
        teamId={slackMeta.teamId}
        botUserId={slackMeta.botUserId}
        scope={slackMeta.scope}
        connectedAt={integration.connectedAt?.toISOString() ?? slackMeta.connectedAt}
        connectionStatus={slackMeta.connectionStatus}
        lastError={slackMeta.lastError ?? integration.lastError ?? undefined}
        canManage={canManage}
        appUrlConfigured={appUrlConfigured}
        webhookUrl={slackWebhookUrl}
      />
    );
  } else if (isPrometheus) {
    const panel = (
      <PrometheusIntegrationPanel
        connected={isConnected}
        trulyConnected={prometheusTruly}
        prometheusUrl={prometheusMeta?.prometheusUrl}
        authType={prometheusMeta?.authType}
        basicUsername={prometheusMeta?.basicUsername}
        connectedAt={integration.connectedAt?.toISOString()}
        connectionStatus={prometheusMeta?.connectionStatus}
        lastError={prometheusMeta?.lastError ?? integration.lastError ?? undefined}
        lastSyncSummary={prometheusMeta?.lastSyncSummary}
        selectedServiceScopes={prometheusMeta?.serviceScopes}
        grafanaProxyActive={Boolean(grafanaParsed.prometheusDatasource?.uid)}
        grafanaProxyDatasourceName={grafanaParsed.prometheusDatasource?.name}
        canManage={canManage}
      />
    );
    body =
      canManage && !prometheusTruly ? (
        <ConnectorConfigureDisclosure summary="Connect Prometheus with a URL and read-only credentials so AIDOS can pull service metrics.">
          {panel}
        </ConnectorConfigureDisclosure>
      ) : (
        panel
      );
  } else if (isGrafana) {
    const panel = (
      <GrafanaIntegrationPanel
        connected={isConnected}
        trulyConnected={grafanaTruly}
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
    );
    body =
      canManage && !grafanaTruly ? (
        <ConnectorConfigureDisclosure summary="Connect Grafana with a URL and service-account token so AIDOS can read dashboards and alerts.">
          {panel}
        </ConnectorConfigureDisclosure>
      ) : (
        panel
      );
  } else if (isAws) {
    const panel = (
      <AwsIntegrationPanel
        connected={isConnected}
        trulyConnected={awsTruly}
        roleArn={awsMeta?.roleArn}
        accountIdHint={awsMeta?.accountIdHint}
        externalIdMasked={awsExternalIdMasked}
        connectedAt={integration.connectedAt?.toISOString()}
        lastScanSummary={awsMeta?.lastScanSummary}
        lastScanAt={awsMeta?.lastScanAt}
        canManage={canManage}
        trustedAccountId={trustedAwsAccountId}
      />
    );
    body =
      canManage && !awsTruly ? (
        <ConnectorConfigureDisclosure summary="Store an IAM assume-role ARN and External ID for read-only cloud inventory scans.">
          {panel}
        </ConnectorConfigureDisclosure>
      ) : (
        panel
      );
  } else {
    body = (
      <div className="flex flex-wrap gap-2">
        {integration.webhookEnabled && <Badge variant="brand">Webhooks active</Badge>}
        {!isConnected && isDev && <StubConnectButton provider={integration.provider} />}
        {!isConnected && !isDev && (
          <p className="text-xs text-muted">Coming soon — not available in this environment.</p>
        )}
        {isConnected && canManage && <DisconnectButton provider={integration.provider} />}
      </div>
    );
  }

  return (
    <Card className={spanWide ? "md:col-span-2" : undefined}>
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
          <p className="text-xs text-muted">
            Last sync:{" "}
            {h.lastSyncAt.toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
        {body}
      </CardContent>
    </Card>
  );
}
