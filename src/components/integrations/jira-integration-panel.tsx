"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DisconnectButton,
  JiraOAuthConnect,
} from "@/components/integrations/integration-actions";

export function JiraIntegrationPanel({
  connected,
  configured,
  siteName,
  siteUrl,
  displayName,
  connectedAt,
  connectionStatus,
  lastError,
  availableSitesCount,
  canManage,
}: {
  connected: boolean;
  configured: boolean;
  siteName?: string;
  siteUrl?: string;
  displayName?: string;
  connectedAt?: string;
  connectionStatus?: "ok" | "error";
  lastError?: string;
  availableSitesCount?: number;
  canManage: boolean;
}) {
  if (!connected) {
    if (!configured) {
      return (
        <p className="text-xs text-muted">
          Set <code>ATLASSIAN_CLIENT_ID</code> and <code>ATLASSIAN_CLIENT_SECRET</code> in{" "}
          <code>.env</code> to enable Jira Cloud OAuth.
        </p>
      );
    }

    if (!canManage) {
      return (
        <p className="text-xs text-muted">
          Jira is not connected. An org admin can connect read-only access from this page.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Connect Jira Cloud with read-only OAuth scopes. AIDOS never writes to your issues,
          epics, or versions.
        </p>
        <JiraOAuthConnect />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">Jira Cloud · read-only</Badge>
          {connectionStatus === "ok" && <Badge variant="success">Connection OK</Badge>}
          {connectionStatus === "error" && <Badge variant="warning">Connection issue</Badge>}
        </div>

        {(siteName || siteUrl) && (
          <p className="text-xs text-secondary">
            Site:{" "}
            {siteUrl ? (
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand hover:underline"
              >
                {siteName ?? siteUrl}
              </a>
            ) : (
              <span className="text-primary">{siteName}</span>
            )}
          </p>
        )}

        {displayName && (
          <p className="text-xs text-secondary">
            Connected as <span className="text-primary">{displayName}</span>
          </p>
        )}

        {connectedAt && (
          <p className="text-xs text-muted">Connected {formatDate(connectedAt)}</p>
        )}

        {availableSitesCount != null && availableSitesCount > 1 && (
          <p className="text-xs text-muted">
            {availableSitesCount} Jira sites available — using the primary site for now.
          </p>
        )}

        {lastError && connectionStatus === "error" && (
          <p className="text-xs text-warning-soft">{lastError}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {siteUrl && (
            <Button size="sm" variant="ghost" asChild>
              <a href={siteUrl} target="_blank" rel="noopener noreferrer">
                Open in Jira
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          {canManage && <DisconnectButton provider="JIRA" />}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
