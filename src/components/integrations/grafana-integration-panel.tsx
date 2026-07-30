"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DisconnectButton } from "@/components/integrations/integration-actions";
import { GrafanaMetricsConfigSection } from "@/components/integrations/grafana-metrics-config-section";
import { formatFixedLocaleDateTime } from "@/lib/format-date";
import type { GrafanaAuthType, GrafanaDashboardScope, GrafanaOperationalSnapshot, GrafanaPrometheusDatasource } from "@/lib/grafana-meta";
import type { ObservabilityAnalysisSnapshot, PrometheusServiceScope } from "@/lib/observability-analysis/types";

type AuthTypeOption = GrafanaAuthType;

type ScopeOption = {
  uid: string;
  title: string;
  type: "dashboard" | "folder";
  folderTitle?: string;
  tags?: string[];
};

function scopeKey(scope: { uid: string; type: string }) {
  return `${scope.type}:${scope.uid}`;
}

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
  operationalSnapshot,
  prometheusDatasource,
  metricsServiceScopes,
  metricsLastSyncSummary,
  metricsSnapshot,
  metricsLastError,
  webhookUrl,
  webhookSecret,
  webhookEnabled,
  appUrlConfigured,
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
  selectedDashboardScopes?: GrafanaDashboardScope[];
  operationalSnapshot?: GrafanaOperationalSnapshot;
  prometheusDatasource?: GrafanaPrometheusDatasource | null;
  metricsServiceScopes?: PrometheusServiceScope[];
  metricsLastSyncSummary?: string;
  metricsSnapshot?: ObservabilityAnalysisSnapshot;
  metricsLastError?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  webhookEnabled?: boolean;
  appUrlConfigured?: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(grafanaUrl ?? "");
  const [auth, setAuth] = useState<AuthTypeOption>(authType ?? "bearer");
  const [apiToken, setApiToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingScopes, setLoadingScopes] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState<ScopeOption[]>([]);
  const [pickedScopes, setPickedScopes] = useState<GrafanaDashboardScope[]>(
    selectedDashboardScopes ?? [],
  );
  const [tagFilter, setTagFilter] = useState("");
  const [alertLabels, setAlertLabels] = useState("");
  const [maxScopes, setMaxScopes] = useState(15);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const savedScopes = selectedDashboardScopes ?? [];
  const hasSelection = savedScopes.length > 0;

  useEffect(() => {
    setUrl(grafanaUrl ?? "");
  }, [grafanaUrl]);

  useEffect(() => {
    if (authType) setAuth(authType);
  }, [authType]);

  useEffect(() => {
    setPickedScopes(selectedDashboardScopes ?? []);
  }, [selectedDashboardScopes]);

  const loadScopes = useCallback(async () => {
    if (!trulyConnected || !canManage) return;
    setLoadingScopes(true);
    try {
      const res = await fetch("/api/integrations/grafana/scopes", {
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load dashboards");
      setItems(data.items ?? []);
      setPickedScopes(data.selectedScopes ?? []);
      if (data.maxScopes) setMaxScopes(data.maxScopes);
      if (data.tagFilter?.length) setTagFilter(data.tagFilter.join(", "));
      if (data.alertLabelSelectors && Object.keys(data.alertLabelSelectors).length > 0) {
        setAlertLabels(
          Object.entries(data.alertLabelSelectors as Record<string, string>)
            .map(([k, v]) => `${k}=${v}`)
            .join(", "),
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load dashboards");
    } finally {
      setLoadingScopes(false);
    }
  }, [trulyConnected, canManage]);

  useEffect(() => {
    void loadScopes();
  }, [loadScopes]);

  function toggleScope(item: ScopeOption) {
    const key = scopeKey(item);
    setPickedScopes((prev) => {
      const exists = prev.some((s) => scopeKey(s) === key);
      if (exists) {
        return prev.filter((s) => scopeKey(s) !== key);
      }
      if (prev.length >= maxScopes) {
        setMessage(`You can select up to ${maxScopes} dashboards or folders`);
        return prev;
      }
      return [
        ...prev,
        {
          uid: item.uid,
          title: item.title,
          type: item.type,
          folderTitle: item.folderTitle,
          tags: item.tags,
        },
      ];
    });
  }

  function parseTagFilter(raw: string): string[] {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function parseAlertLabelSelectors(raw: string): Record<string, string> {
    const selectors: Record<string, string> = {};
    for (const part of raw.split(",")) {
      const [key, ...rest] = part.split("=");
      const k = key?.trim();
      const v = rest.join("=").trim();
      if (k && v) selectors[k] = v;
    }
    return selectors;
  }

  async function saveSelection() {
    if (pickedScopes.length === 0) {
      setMessage("Select at least one dashboard or folder");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/grafana/scopes", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboardScopes: pickedScopes,
          tagFilter: parseTagFilter(tagFilter),
          alertLabelSelectors: parseAlertLabelSelectors(alertLabels),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save selection");
      setMessage(`Saved ${data.dashboardScopes.length} scope(s) for sync`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save selection");
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    if (!hasSelection) {
      setMessage("Save at least one dashboard or folder before syncing");
      return;
    }
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/grafana/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setMessage(data.summary ?? "Grafana sync complete");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

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
      setMessage("Grafana connected — select dashboards to sync");
      setApiToken("");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  async function copyWebhookUrl() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {
      setMessage("Could not copy webhook URL");
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
              className="font-medium text-chart-blue hover:underline"
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
          Choose which Grafana dashboards or folders this organization syncs. Folders expand to
          all dashboards inside at sync time.
        </p>

        {canManage ? (
          <>
            {loadingScopes ? (
              <p className="text-xs text-muted">Loading dashboards from Grafana…</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-muted">
                No dashboards or folders found, or unable to load the list.
              </p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-base/50 p-2">
                {items.map((item) => {
                  const checked = pickedScopes.some((s) => scopeKey(s) === scopeKey(item));
                  const atLimit = !checked && pickedScopes.length >= maxScopes;
                  return (
                    <li key={scopeKey(item)}>
                      <label
                        className={`flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-xs ${
                          atLimit ? "cursor-not-allowed opacity-50" : "hover:bg-elevated/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-chart-blue"
                          checked={checked}
                          disabled={atLimit}
                          onChange={() => toggleScope(item)}
                        />
                        <span>
                          <span className="font-medium text-primary">{item.title}</span>
                          <span className="text-muted">
                            {" "}
                            · {item.type === "folder" ? "Folder" : "Dashboard"}
                          </span>
                          {item.folderTitle && item.type === "dashboard" && (
                            <span className="text-muted"> · {item.folderTitle}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            <details className="rounded-lg border border-border bg-base/30 p-2">
              <summary className="cursor-pointer text-xs font-medium text-primary">
                Advanced filters (optional)
              </summary>
              <div className="mt-2 space-y-2">
                <label className="block space-y-1">
                  <span className="text-xs text-muted">Tag filter (comma-separated)</span>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
                    placeholder="production, platform"
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-muted">
                    Alert label selectors (e.g. team=platform, severity=critical)
                  </span>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
                    placeholder="team=platform"
                    value={alertLabels}
                    onChange={(e) => setAlertLabels(e.target.value)}
                  />
                </label>
              </div>
            </details>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={saving || loadingScopes || pickedScopes.length === 0}
                onClick={saveSelection}
              >
                {saving ? "Saving…" : "Save selection"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loadingScopes}
                onClick={() => void loadScopes()}
              >
                Refresh list
              </Button>
            </div>
          </>
        ) : savedScopes.length > 0 ? (
          <p className="text-xs text-secondary">
            Sync targets:{" "}
            {savedScopes.map((scope, i) => (
              <span key={scopeKey(scope)}>
                {i > 0 ? ", " : null}
                <span className="font-medium text-chart-blue">{scope.title}</span>
              </span>
            ))}
          </p>
        ) : (
          <p className="text-xs text-muted">No dashboards selected yet.</p>
        )}
      </div>

      <GrafanaMetricsConfigSection
        trulyConnected={trulyConnected}
        canManage={canManage}
        prometheusDatasource={prometheusDatasource}
        metricsServiceScopes={metricsServiceScopes}
        metricsLastSyncSummary={metricsLastSyncSummary}
        metricsSnapshot={metricsSnapshot}
        metricsLastError={metricsLastError}
      />

      {hasSelection && (
        <p className="text-xs text-muted">
          Sync targets:{" "}
          {savedScopes.map((scope, i) => (
            <span key={scopeKey(scope)}>
              {i > 0 ? ", " : null}
              <span className="font-medium text-chart-blue">{scope.title}</span>
            </span>
          ))}
        </p>
      )}

      {lastSyncSummary && (
        <p className="text-xs text-success-soft">{lastSyncSummary}</p>
      )}

      {message && (
        <p
          className={`text-xs ${
            message.toLowerCase().includes("fail") || message.toLowerCase().includes("error")
              ? "text-warning-soft"
              : "text-secondary"
          }`}
        >
          {message}
        </p>
      )}

      {canManage && (
        <Button
          type="button"
          size="sm"
          variant="brand"
          disabled={syncing || !hasSelection}
          onClick={sync}
        >
          <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {syncing ? "Syncing…" : "Sync Grafana data"}
        </Button>
      )}

      {!canManage && !hasSelection && (
        <p className="text-xs text-muted">An org admin must select dashboards before sync.</p>
      )}

      {operationalSnapshot && operationalSnapshot.dashboards.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-primary">Observability snapshot</p>
          <div className="flex flex-wrap gap-2 text-xs text-secondary">
            <span>Health {operationalSnapshot.kpis.healthScore}</span>
            <span>·</span>
            <span>{operationalSnapshot.kpis.openAlerts} firing</span>
            <span>·</span>
            <span>{operationalSnapshot.kpis.dashboardCoveragePct}% coverage</span>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-elevated/50 p-2 text-xs">
            {operationalSnapshot.dashboards.map((d) => (
              <li key={d.uid} className="flex justify-between gap-2 py-1 text-secondary">
                <span className="truncate font-medium text-primary">{d.title}</span>
                <span className="shrink-0 text-muted">
                  {d.panelCount} panels
                  {d.missingDatasource ? " · missing DS" : d.hasRecentData ? " · OK" : " · stale"}
                </span>
              </li>
            ))}
          </ul>
          {operationalSnapshot.generatedAt && (
            <p className="text-[11px] text-muted">
              Snapshot from {formatDate(operationalSnapshot.generatedAt)}
            </p>
          )}
        </div>
      )}

      {webhookUrl && (
        <div className="rounded-lg border border-border bg-elevated/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-primary">Alert webhook</p>
            {webhookEnabled && <Badge variant="brand">Webhooks active</Badge>}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Add this URL as a Grafana contact point for unified alerting. Real-time firing alerts
            create incidents in AIDOS.
          </p>
          {!appUrlConfigured && (
            <p className="mt-2 text-[11px] text-warning-soft">
              Set <code className="text-warning">NEXT_PUBLIC_APP_URL</code> for production webhook
              delivery.
            </p>
          )}
          <p className="mt-2 break-all font-mono text-[11px] text-muted">{webhookUrl}</p>
          {webhookSecret && (
            <p className="mt-2 text-[11px] text-muted">
              Secret: <span className="font-mono text-secondary">{webhookSecret}</span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={copyWebhookUrl}>
              {copiedWebhook ? "Copied" : "Copy webhook URL"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Grafana contact point: Webhook · Method POST · Include{" "}
            <code className="text-secondary">secret</code> query param or{" "}
            <code className="text-secondary">X-AIDOS-Webhook-Secret</code> header.
          </p>
        </div>
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
  return formatFixedLocaleDateTime(iso);
}
