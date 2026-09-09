"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFixedLocaleDateTime } from "@/lib/format-date";
import { useAppData } from "@/lib/store";

/** Jira connect card from store integrations data. */
export function JiraMockSessionFromStore() {
  const jira = useAppData((s) =>
    s.data.integrations.items.find((i) => i.provider.toLowerCase() === "jira"),
  );

  if (!jira?.mockSession) return null;

  const projectKey = jira.projectKeys?.[0] ?? "";
  const siteName = jira.siteName ?? "";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">Jira</CardTitle>
          <Badge variant="success">CONNECTED</Badge>
        </div>
        <CardDescription>
          Connected for this workspace — read-only delivery evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand">Jira Cloud · read-only</Badge>
            <Badge variant="success">Connection OK</Badge>
          </div>
          {projectKey ? (
            <p className="text-sm text-primary">
              Connected to Jira on project key{" "}
              <span className="font-semibold tabular-nums">{projectKey}</span>
            </p>
          ) : null}
          {siteName ? (
            <p className="text-xs text-secondary">
              Site: <span className="text-primary">{siteName}</span>
            </p>
          ) : null}
          {jira.lastSyncAt && (
            <p className="text-xs text-muted">
              Last sync: {formatFixedLocaleDateTime(jira.lastSyncAt)}
            </p>
          )}
          {jira.projectKeys && jira.projectKeys.length > 0 ? (
            <p className="text-xs text-muted">
              Sync targets: {jira.projectKeys.join(", ")}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
