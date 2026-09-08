"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppData } from "@/lib/store";

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  jira: "Jira",
  grafana: "Grafana",
  prometheus: "Prometheus",
  slack: "Slack",
  aws: "Cloud Hygiene",
  GITHUB: "GitHub",
  JIRA: "Jira",
  GRAFANA: "Grafana",
  PROMETHEUS: "Prometheus",
  SLACK: "Slack",
  AWS: "Cloud Hygiene",
};

function connectorDetail(item: {
  provider: string;
  projectKeys?: string[];
  siteName?: string;
  mockSession?: boolean;
}): string | null {
  const keys = item.projectKeys?.filter(Boolean) ?? [];
  if (item.provider.toLowerCase() === "jira" && keys.length > 0) {
    const keyLabel =
      keys.length === 1 ? `project key ${keys[0]}` : `project keys ${keys.join(", ")}`;
    return item.mockSession
      ? `Connected to Jira on ${keyLabel}`
      : `Syncing ${keyLabel}`;
  }
  if (item.siteName) return item.siteName;
  return null;
}

export function IntegrationsStatusFromStore() {
  const items = useAppData((s) => s.data.integrations.items);

  if (items.length === 0) return null;

  const connected = items.filter((i) => i.status === "CONNECTED").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connector status</CardTitle>
        <CardDescription>
          {connected} of {items.length} connectors connected in the current evidence set.
          Mock Jira sessions show as connected without live OAuth.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => {
            const detail = connectorDetail(item);
            return (
              <li
                key={item.id}
                className="inline-flex flex-wrap items-center gap-2 rounded-[9px] border border-border bg-pure-white px-3 py-2 text-sm"
              >
                <span className="font-medium text-ink">
                  {PROVIDER_LABELS[item.provider] ?? item.provider}
                </span>
                <Badge variant={item.status === "CONNECTED" ? "success" : "muted"}>
                  {item.status}
                </Badge>
                {detail && (
                  <span className="text-xs text-secondary">{detail}</span>
                )}
                {item.mockSession && (
                  <Badge variant="muted">Mock session</Badge>
                )}
                {item.lastSyncAt && (
                  <span className="text-xs text-muted" suppressHydrationWarning>
                    synced{" "}
                    {new Date(item.lastSyncAt).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
