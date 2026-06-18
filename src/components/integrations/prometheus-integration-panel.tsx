"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DisconnectButton } from "@/components/integrations/integration-actions";
import type { PrometheusAuthType } from "@/lib/prometheus-meta";

type AuthTypeOption = PrometheusAuthType;

export function PrometheusIntegrationPanel({
  connected,
  trulyConnected,
  prometheusUrl,
  authType,
  basicUsername: savedBasicUsername,
  connectedAt,
  connectionStatus,
  lastError,
  lastSyncSummary,
  selectedServiceScopes,
  grafanaProxyActive,
  grafanaProxyDatasourceName,
  canManage,
}: {
  connected: boolean;
  trulyConnected: boolean;
  prometheusUrl?: string;
  authType?: AuthTypeOption;
  basicUsername?: string;
  connectedAt?: string;
  connectionStatus?: "ok" | "error";
  lastError?: string;
  lastSyncSummary?: string;
  selectedServiceScopes?: Array<{ id: string; label: string }>;
  grafanaProxyActive?: boolean;
  grafanaProxyDatasourceName?: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(prometheusUrl ?? "");
  const [auth, setAuth] = useState<AuthTypeOption>(authType ?? "bearer");
  const [apiToken, setApiToken] = useState("");
  const [basicUsername, setBasicUsername] = useState(savedBasicUsername ?? "");
  const [basicPassword, setBasicPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setUrl(prometheusUrl ?? "");
  }, [prometheusUrl]);

  useEffect(() => {
    if (authType) setAuth(authType);
  }, [authType]);

  useEffect(() => {
    if (savedBasicUsername) setBasicUsername(savedBasicUsername);
  }, [savedBasicUsername]);

  async function connect() {
    if (!url.trim()) {
      setMessage("Enter your Prometheus URL");
      return;
    }
    if (auth === "bearer" && !apiToken.trim() && !trulyConnected) {
      setMessage("Enter an API token");
      return;
    }
    if (auth === "basic") {
      if (!basicUsername.trim() && !trulyConnected) {
        setMessage("Enter a username");
        return;
      }
      if (!basicPassword.trim() && !trulyConnected) {
        setMessage("Enter a password");
        return;
      }
    }

    setConnecting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/prometheus/connect", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prometheusUrl: url.trim(),
          authType: auth,
          apiToken: apiToken.trim() || undefined,
          basicUsername: basicUsername.trim() || undefined,
          basicPassword: basicPassword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      setMessage("Prometheus connected — run sync to populate metrics");
      setApiToken("");
      setBasicPassword("");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/prometheus/sync", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setMessage(data.summary ?? "Prometheus sync complete");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (!connected || !trulyConnected) {
    if (!canManage) {
      return (
        <p className="text-xs text-muted">
          Prometheus is not connected. An org admin can connect read-only access from this page.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-base/30 p-2">
          <p className="text-xs font-medium text-primary">Connection mode</p>
          <p className="mt-1 text-xs text-muted">
            <span className="text-secondary">◉ Direct to Prometheus</span>
            <br />
            <span className="text-muted">○ Through Grafana — configure on Grafana card (private network)</span>
          </p>
        </div>

        <p className="text-xs text-muted">
          Connect your Prometheus instance with read-only query access. AIDOS runs PromQL templates
          at sync time — it never writes to Prometheus.
        </p>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-primary">Prometheus URL</span>
          <input
            type="url"
            className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
            placeholder="https://prometheus.example.com"
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
            <option value="bearer">Bearer token</option>
            <option value="basic">Basic auth</option>
            <option value="none">None (internal network)</option>
          </select>
        </label>

        {auth === "bearer" && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-primary">API token</span>
            <input
              type="password"
              className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
              placeholder={trulyConnected ? "Leave blank to keep existing token" : "Bearer token"}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}

        {auth === "basic" && (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-primary">Username</span>
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
                value={basicUsername}
                onChange={(e) => setBasicUsername(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-primary">Password</span>
              <input
                type="password"
                className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
                placeholder={trulyConnected ? "Leave blank to keep existing password" : "Password"}
                value={basicPassword}
                onChange={(e) => setBasicPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          </>
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
          {connecting ? "Connecting…" : connected && !trulyConnected ? "Replace stub connection" : "Connect Prometheus"}
        </Button>
      </div>
    );
  }

  const scopeLabels = selectedServiceScopes?.map((s) => s.label) ?? [];

  return (
    <div className="space-y-4">
      {grafanaProxyActive && (
        <div className="rounded-lg border border-chart-blue/30 bg-sky-wash/50 p-3">
          <p className="text-xs text-secondary">
            Metrics are provided via Grafana → {grafanaProxyDatasourceName ?? "Prometheus"}.
            Direct connection is optional.
          </p>
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">Prometheus · read-only</Badge>
          {connectionStatus === "ok" && <Badge variant="success">Connection OK</Badge>}
          {connectionStatus === "error" && <Badge variant="warning">Connection issue</Badge>}
        </div>

        {prometheusUrl && (
          <p className="text-xs text-secondary">
            URL:{" "}
            <a
              href={prometheusUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-chart-blue hover:underline"
            >
              {prometheusUrl.replace(/^https?:\/\//, "")}
            </a>
          </p>
        )}

        {authType && (
          <p className="text-xs text-muted">
            Auth: {authType === "bearer" ? "Bearer token" : authType === "basic" ? "Basic auth" : "None"}
          </p>
        )}

        {connectedAt && (
          <p className="text-xs text-muted">Connected {formatDate(connectedAt)}</p>
        )}

        {lastError && connectionStatus === "error" && (
          <p className="text-xs text-warning-soft">{lastError}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {prometheusUrl && (
            <Button size="sm" variant="ghost" asChild>
              <a href={prometheusUrl} target="_blank" rel="noopener noreferrer">
                Open Prometheus
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          {canManage && <DisconnectButton provider="PROMETHEUS" />}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
        <p className="text-xs font-medium text-primary">Services to analyze</p>
        <p className="text-xs text-muted">
          PromQL templates run at sync time for selected service scopes. Sync populates metrics
          used in release assess and observability.
        </p>
        {scopeLabels.length > 0 ? (
          <p className="text-xs text-secondary">
            Selected:{" "}
            {scopeLabels.map((label, i) => (
              <span key={label}>
                {i > 0 ? ", " : null}
                <span className="font-medium text-chart-blue">{label}</span>
              </span>
            ))}
          </p>
        ) : (
          <p className="text-xs text-muted">No services selected yet.</p>
        )}
      </div>

      {lastSyncSummary && (
        <p className="text-xs text-success-soft">{lastSyncSummary}</p>
      )}

      {canManage && (
        <Button
          type="button"
          size="sm"
          variant="brand"
          disabled={syncing}
          onClick={sync}
        >
          <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {syncing ? "Syncing…" : "Sync Prometheus metrics"}
        </Button>
      )}

      {canManage && (
        <details className="rounded-lg border border-border bg-elevated/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-primary">
            Update connection
          </summary>
          <div className="mt-3 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-primary">Prometheus URL</span>
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
                <option value="bearer">Bearer token</option>
                <option value="basic">Basic auth</option>
                <option value="none">None (internal network)</option>
              </select>
            </label>
            {auth === "bearer" && (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-primary">New API token (optional)</span>
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
            {auth === "basic" && (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-primary">Username</span>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
                    value={basicUsername}
                    onChange={(e) => setBasicUsername(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-primary">New password (optional)</span>
                  <input
                    type="password"
                    className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
                    placeholder="Leave blank to keep existing"
                    value={basicPassword}
                    onChange={(e) => setBasicPassword(e.target.value)}
                  />
                </label>
              </>
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
