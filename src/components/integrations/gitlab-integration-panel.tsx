import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalConnectLinkPanel } from "@/components/integrations/external-connect-link-panel";
import {
  DisconnectButton,
  GitLabOAuthConnect,
} from "@/components/integrations/integration-actions";

export function GitLabIntegrationPanel({
  connected,
  configured,
  displayName,
  baseUrl,
  canManage,
  appUrlConfigured,
}: {
  connected: boolean;
  configured: boolean;
  displayName?: string | null;
  baseUrl?: string | null;
  canManage: boolean;
  appUrlConfigured: boolean;
}) {
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">GitLab</CardTitle>
          <Badge variant={connected ? "success" : "muted"}>
            {connected ? "Connected" : "Not connected"}
          </Badge>
        </div>
        <CardDescription>
          Read-only OAuth for scripts. DryDock does not sync merge requests or pipelines yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connected && (
          <p className="text-sm text-secondary">
            Linked @{displayName ?? "gitlab"}
            {baseUrl ? ` on ${baseUrl.replace(/^https:\/\//, "")}` : ""}. Print a token with{" "}
            <code className="text-xs">npx tsx scripts/gitlab-env.ts</code>.
          </p>
        )}
        {!connected && !configured && (
          <p className="text-sm text-secondary">
            Add <code className="text-xs">GITLAB_CLIENT_ID</code> and{" "}
            <code className="text-xs">GITLAB_CLIENT_SECRET</code> to <code className="text-xs">.env</code>,
            then restart the app.
          </p>
        )}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {!connected && configured && <GitLabOAuthConnect />}
            {connected && <DisconnectButton provider="GITLAB" />}
          </div>
        )}
        <ExternalConnectLinkPanel
          provider="GITLAB"
          connected={connected}
          canManage={canManage}
          appUrlConfigured={appUrlConfigured}
          providerConfigured={configured}
          providerConfigHint="Set GITLAB_CLIENT_ID and GITLAB_CLIENT_SECRET in .env."
        />
      </CardContent>
    </Card>
  );
}
