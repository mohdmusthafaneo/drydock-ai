"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFixedLocaleDateTime } from "@/lib/format-date";
import { useAppData } from "@/lib/store";

/**
 * Mock Connect-session card for Jira — used when the evidence set is mock
 * so Connect shows “connected to Jira on project key TP” without live OAuth.
 */
export function JiraMockSessionFromStore() {
  const mode = useAppData((s) => s.data.meta.mode);
  const jira = useAppData((s) =>
    s.data.integrations.items.find((i) => i.provider.toLowerCase() === "jira"),
  );

  if (mode === "live" || !jira?.mockSession) return null;

  const projectKey = jira.projectKeys?.[0] ?? "TP";
  const siteName = jira.siteName ?? "TPT Platform";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">Jira</CardTitle>
          <Badge variant="success">CONNECTED</Badge>
        </div>
        <CardDescription>
          Mock connect session for the TPT evidence set — no live OAuth tokens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand">Jira Cloud · read-only</Badge>
            <Badge variant="success">Connection OK</Badge>
            <Badge variant="muted">Mock session</Badge>
          </div>
          <p className="text-sm text-primary">
            Connected to Jira on project key{" "}
            <span className="font-semibold tabular-nums">{projectKey}</span>
          </p>
          <p className="text-xs text-secondary">
            Site: <span className="text-primary">{siteName}</span>
          </p>
          {jira.lastSyncAt && (
            <p className="text-xs text-muted">
              Last sync: {formatFixedLocaleDateTime(jira.lastSyncAt)}
            </p>
          )}
          <p className="text-xs text-muted">
            Sync targets: {jira.projectKeys?.join(", ") ?? projectKey}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
