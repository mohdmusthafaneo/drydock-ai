"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DisconnectButton } from "@/components/integrations/integration-actions";
import type { GrafanaAuthType } from "@/lib/grafana-meta";

type AuthTypeOption = GrafanaAuthType;

export function GrafanaIntegrationPanel({
  connected,
  trulyConnected,
  grafanaUrl,
  authType,
  connectedAt,
  connectionStatus,
  lastError,
  lastSyncSummary,
  selectedDashboardScopes,
  canManage,
}: {
  connected: boolean;
  trulyConnected: boolean;
  grafanaUrl?: string;
  authType?: AuthTypeOption;
  connectedAt?: string;
  connectionStatus?: "ok" | "error";
  lastError?: string;
  lastSyncSummary?: string;
  selectedDashboardScopes?: Array<{ uid: string; title: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(grafanaUrl ?? "");
  const [auth, setAuth] = useState<AuthTypeOption>(authType ?? "bearer");
  const [apiToken, setApiToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setUrl(grafanaUrl ?? "");
  }, [grafanaUrl]);

  useEffect(() => {
    if (authType) setAuth(authType);
  }, [authType]);

  async function connect() {
    if (!url.trim()) {
      setMessage("Enter your Grafana URL");
      return;
    }
    if (auth === "bearer" && !apiToken.trim() && !trulyConnected) {
      setMessage("Enter a service account token");
      return;
    }

    setConnecting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/grafana/connect", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grafanaUrl: url.trim(),
          authType: auth,
          apiToken: apiToken.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      setMessage("Grafana connected — select dashboards to sync (coming in next step)");
      setApiToken("");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  if (!connected || !trulyConnected) {
    if (!canManage) {
      return (
        <p className="text-xs text-muted">
          Grafana is not connected. An org admin can connect read-only access from this page.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Connect your Grafana instance with read-only access. AIDOS reads dashboard health,
          firing alerts, and annotations — it never writes to Grafana.
        </p>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-primary">Grafana URL</span>
          <input
            type="url"
            className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
            placeholder="https://grafana.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-primary">Authentication</span>
          <select
            className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
            value={auth}
            onChange={(e) => setAuth(e.target.value as AuthTypeOption)}
          >
            <option value="bearer">Service account token</option>
            <option value="none">None (internal network)</option>
          </select>
        </label>

        {auth === "bearer" && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-primary">Service account token</span>
            <input
              type="password"
              className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
              placeholder={trulyConnected ? "Leave blank to keep existing token" : "Viewer + alerting read"}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}

        {message && (
          <p
            className={`text-xs ${
              message.toLowerCase().includes("fail") ||
              message.toLowerCase().includes("error") ||
              message.includes("Enter") ||
              message.includes("required") ||
              message.includes("rejected") ||
              message.includes("Unable")
                ? "text-warning-soft"
                : "text-secondary"
            }`}
          >
            {message}
          </p>
        )}

        <Button type="button" size="sm" variant="brand" disabled={connecting} onClick={connect}>
          {connecting
            ? "Connecting…"
            : connected && !trulyConnected
              ? "Replace stub connection"
              : "Connect Grafana"}
        </Button>
      </div>
    );
  }

  const scopeLabels = selectedDashboardScopes?.map((s) => s.title) ?? [];

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">Grafana · read-only</Badge>
          {connectionStatus === "ok" && <Badge variant="success">Connection OK</Badge>}
          {connectionStatus === "error" && <Badge variant="warning">Connection issue</Badge>}
        </div>

        {grafanaUrl && (
          <p className="text-xs text-secondary">
            URL:{" "}
            <a
              href={grafanaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand hover:underline"
            >
              {grafanaUrl.replace(/^https?:\/\//, "")}
            </a>
          </p>
        )}

        {authType && (
          <p className="text-xs text-muted">
            Auth: {authType === "bearer" ? "Service account token" : "None"}
          </p>
        )}

        {connectedAt && (
          <p className="text-xs text-muted">Connected {formatDate(connectedAt)}</p>
        )}

        {lastError && connectionStatus === "error" && (
          <p className="text-xs text-warning-soft">{lastError}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {grafanaUrl && (
            <Button size="sm" variant="ghost" asChild>
              <a href={grafanaUrl} target="_blank" rel="noopener noreferrer">
                Open Grafana
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          {canManage && <DisconnectButton provider="GRAFANA" />}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
        <p className="text-xs font-medium text-primary">Dashboards to analyze</p>
        <p className="text-xs text-muted">
          Dashboard scope selection and sync ship in the next phase. Choose which dashboards or
          folders to include once scope discovery is enabled.
        </p>
        {scopeLabels.length > 0 ? (
          <p className="text-xs text-secondary">
            Selected:{" "}
            {scopeLabels.map((label, i) => (
              <span key={label}>
                {i > 0 ? ", " : null}
                <span className="font-medium text-brand">{label}</span>
              </span>
            ))}
          </p>
        ) : (
          <p className="text-xs text-muted">No dashboards selected yet.</p>
        )}
      </div>

      {lastSyncSummary && (
        <p className="text-xs text-success-soft">{lastSyncSummary}</p>
      )}

      {canManage && (
        <details className="rounded-lg border border-border bg-elevated/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-primary">
            Update connection
          </summary>
          <div className="mt-3 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-primary">Grafana URL</span>
              <input
                type="url"
                className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-primary">Authentication</span>
              <select
                className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
                value={auth}
                onChange={(e) => setAuth(e.target.value as AuthTypeOption)}
              >
                <option value="bearer">Service account token</option>
                <option value="none">None (internal network)</option>
              </select>
            </label>
            {auth === "bearer" && (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-primary">New token (optional)</span>
                <input
                  type="password"
                  className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
                  placeholder="Leave blank to keep existing"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
            {message && (
              <p
                className={`text-xs ${
                  message.toLowerCase().includes("fail") ||
                  message.toLowerCase().includes("error") ||
                  message.includes("rejected") ||
                  message.includes("Unable")
                    ? "text-warning-soft"
                    : "text-secondary"
                }`}
              >
                {message}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={connecting}
              onClick={connect}
            >
              {connecting ? "Updating…" : "Save & re-probe"}
            </Button>
          </div>
        </details>
      )}
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
