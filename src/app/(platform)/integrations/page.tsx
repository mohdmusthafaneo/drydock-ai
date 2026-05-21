import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { getGitHubOAuthConfig } from "@/lib/github-oauth";
import { getGitHubSyncRepoAllowlist } from "@/lib/github-api";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { checkIntegrationHealth } from "@/lib/integration-health";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IntegrationAlerts } from "@/components/integrations/integration-alerts";
import { SyncIntegrationsButton } from "@/components/integrations/integration-health-actions";
import { GitHubIntegrationPanel } from "@/components/integrations/github-integration-panel";
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

export default async function IntegrationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const githubWebhookUrl = `${appUrl}/api/webhooks/github?organizationId=${session.organizationId}`;

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { workspaceMode: true },
  });

  const isMvp = org?.workspaceMode === "MVP";
  const ctx = await getOrganizationContext(session.organizationId);
  const githubOAuthConfigured = getGitHubOAuthConfig().configured;
  const githubSyncRepos = getGitHubSyncRepoAllowlist();
  const canManage = hasPermission(session, "integrations", "manage_integrations");

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
            : "Phase 1 — OAuth, webhooks, metadata sync, and health monitoring for your operational stack."
        }
      >
        {!isMvp && canManage && <SyncIntegrationsButton />}
      </PageHeader>

      <Suspense fallback={null}>
        <IntegrationAlerts />
      </Suspense>

      {!githubOAuthConfigured && (
        <Card className="border-warning/30 bg-warning-muted/50">
          <CardHeader>
            <CardTitle className="text-base">GitHub OAuth setup required</CardTitle>
            <CardDescription>
              Create a GitHub OAuth App and add credentials to <code>.env</code> (see checklist
              below).
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration, idx) => {
          const meta = parseIntegrationMeta(integration.metadataJson);
          const h = health[idx];
          const isGitHub = integration.provider === "GITHUB";
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
                {integration.webhookEnabled && <Badge variant="brand">Webhooks active</Badge>}

                {isGitHub ? (
                  <GitHubIntegrationPanel
                    connected={isConnected}
                    githubLogin={meta.githubLogin}
                    lastSyncSummary={meta.lastSyncSummary}
                    repos={meta.repos}
                    syncRepos={githubSyncRepos}
                    webhookUrl={githubWebhookUrl}
                    oauthConfigured={githubOAuthConfigured}
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {!isConnected && <StubConnectButton provider={integration.provider} />}
                    {isConnected && canManage && (
                      <DisconnectButton provider={integration.provider} />
                    )}
                  </div>
                )}

                {isConnected && isGitHub && canManage && (
                  <DisconnectButton provider="GITHUB" />
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
