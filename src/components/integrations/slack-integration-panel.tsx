"use client";

import { Badge } from "@/components/ui/badge";
import {
  DisconnectButton,
  SlackOAuthConnect,
} from "@/components/integrations/integration-actions";
import { ExternalConnectLinkPanel } from "@/components/integrations/external-connect-link-panel";
import { formatFixedLocaleDateTime } from "@/lib/format-date";

export function SlackIntegrationPanel({
  connected,
  configured,
  teamName,
  teamId,
  botUserId,
  scope,
  connectedAt,
  connectionStatus,
  lastError,
  canManage,
  appUrlConfigured,
  webhookUrl,
}: {
  connected: boolean;
  configured: boolean;
  teamName?: string;
  teamId?: string;
  botUserId?: string;
  scope?: string;
  connectedAt?: string;
  connectionStatus?: "ok" | "error";
  lastError?: string;
  canManage: boolean;
  appUrlConfigured: boolean;
  webhookUrl?: string;
}) {
  const showConnectionIssue =
    connectionStatus === "error" || Boolean(lastError);

  if (!connected) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-secondary">
          Install the AIDOS Slack app in your workspace so members can ask
          read-only operational questions via @mention or DM.
        </p>
        {!configured && (
          <p className="text-xs text-warning-soft">
            Set <code>SLACK_CLIENT_ID</code>, <code>SLACK_CLIENT_SECRET</code>, and{" "}
            <code>SLACK_SIGNING_SECRET</code> in <code>.env</code> before connecting.
          </p>
        )}
        {canManage && configured && (
          <div className="flex flex-wrap gap-2">
            <SlackOAuthConnect label="Add to Slack" />
          </div>
        )}
        {canManage && (
          <ExternalConnectLinkPanel
            provider="SLACK"
            connected={false}
            canManage={canManage}
            appUrlConfigured={appUrlConfigured}
            providerConfigured={configured}
            providerConfigHint="Configure Slack OAuth env vars before generating a share link."
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={showConnectionIssue ? "error" : "success"}>
          {showConnectionIssue ? "Needs attention" : "Connected"}
        </Badge>
        {teamName && (
          <span className="text-sm font-medium text-primary">{teamName}</span>
        )}
        {teamId && (
          <span className="font-mono text-[11px] text-muted">{teamId}</span>
        )}
      </div>

      <dl className="grid gap-2 text-xs text-secondary sm:grid-cols-2">
        {botUserId && (
          <div>
            <dt className="text-muted">Bot user</dt>
            <dd className="font-mono">{botUserId}</dd>
          </div>
        )}
        {connectedAt && (
          <div>
            <dt className="text-muted">Connected</dt>
            <dd>{formatFixedLocaleDateTime(connectedAt)}</dd>
          </div>
        )}
        {scope && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Scopes</dt>
            <dd className="break-words font-mono text-[11px]">{scope}</dd>
          </div>
        )}
        {webhookUrl && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Events Request URL</dt>
            <dd className="break-all font-mono text-[11px]">{webhookUrl}</dd>
          </div>
        )}
      </dl>

      {showConnectionIssue && (
        <p className="text-xs text-warning-soft">
          {lastError ?? "Reconnect Slack to restore the assistant channel."}
        </p>
      )}

      <p className="text-xs text-muted">
        Mention @AIDOS in a channel or DM the bot. Only workspace members whose
        Slack email matches an active AIDOS user with Agents access will get
        answers. Conversations appear under Agent Threads.
      </p>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {showConnectionIssue && configured && (
            <SlackOAuthConnect label="Reconnect Slack" variant="secondary" />
          )}
          <DisconnectButton provider="SLACK" />
        </div>
      )}
    </div>
  );
}
