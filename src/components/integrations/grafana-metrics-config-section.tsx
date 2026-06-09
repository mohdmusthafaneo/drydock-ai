"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  GrafanaPrometheusDatasource,
  GrafanaIntegrationMeta,
} from "@/lib/grafana-meta";
import type { PrometheusServiceScope } from "@/lib/observability-analysis/types";

type DatasourceOption = {
  uid: string;
  name: string;
  type: string;
  isDefault: boolean;
};

export function GrafanaMetricsConfigSection({
  trulyConnected,
  canManage,
  prometheusDatasource,
  metricsServiceScopes,
  metricsLastSyncSummary,
  metricsSnapshot,
  metricsLastError,
}: {
  trulyConnected: boolean;
  canManage: boolean;
  prometheusDatasource?: GrafanaPrometheusDatasource | null;
  metricsServiceScopes?: PrometheusServiceScope[];
  metricsLastSyncSummary?: string;
  metricsSnapshot?: GrafanaIntegrationMeta["metricsSnapshot"];
  metricsLastError?: string;
}) {
  const router = useRouter();
  const [datasources, setDatasources] = useState<DatasourceOption[]>([]);
  const [selectedUid, setSelectedUid] = useState(prometheusDatasource?.uid ?? "");
  const [scopeInput, setScopeInput] = useState(
    (metricsServiceScopes ?? []).map((s) => s.label).join(", "),
  );
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadDatasources = useCallback(async () => {
    if (!trulyConnected || !canManage) return;
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/grafana/datasources", {
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load datasources");
      const list = (data.datasources ?? []) as DatasourceOption[];
      setDatasources(list);

      if (data.selected?.uid) {
        setSelectedUid(data.selected.uid);
      } else if (list.length === 1) {
        setSelectedUid(list[0].uid);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load datasources");
    } finally {
      setLoading(false);
    }
  }, [trulyConnected, canManage]);

  useEffect(() => {
    void loadDatasources();
  }, [loadDatasources]);

  useEffect(() => {
    if (prometheusDatasource?.uid) {
      setSelectedUid(prometheusDatasource.uid);
    }
  }, [prometheusDatasource?.uid]);

  function parseScopes(raw: string): PrometheusServiceScope[] {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((label) => ({
        id: label.toLowerCase().replace(/\s+/g, "-"),
        label,
        type: "service" as const,
      }));
  }

  async function testProbe() {
    if (!selectedUid) {
      setMessage("Select a Prometheus datasource first");
      return;
    }
    setProbing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/grafana/metrics-config/probe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasourceUid: selectedUid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Probe failed");
      setMessage(`Test query OK: ${data.summary}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Probe failed");
    } finally {
      setProbing(false);
    }
  }

  async function saveConfig() {
    const ds = datasources.find((d) => d.uid === selectedUid);
    if (!ds) {
      setMessage("Select a Prometheus datasource");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/grafana/metrics-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prometheusDatasource: { uid: ds.uid, name: ds.name, type: "prometheus" },
          metricsServiceScopes: parseScopes(scopeInput),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMessage(`Saved · probe: ${data.probe?.summary ?? "OK"}`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!trulyConnected) return null;

  const selectedDs = datasources.find((d) => d.uid === selectedUid);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-primary">Metrics via Grafana</p>
        {prometheusDatasource?.lastProbeStatus === "ok" && (
          <Badge variant="success">Probe OK</Badge>
        )}
      </div>
      <p className="text-xs text-muted">
        Query PromQL through Grafana when Prometheus is on a private network. Token needs{" "}
        <code className="text-secondary">datasources:read</code> and{" "}
        <code className="text-secondary">datasources:query</code>.
      </p>

      {canManage ? (
        <>
          {loading ? (
            <p className="text-xs text-muted">Loading Prometheus datasources…</p>
          ) : datasources.length === 0 ? (
            <p className="text-xs text-muted">No Prometheus datasources found in Grafana.</p>
          ) : (
            <label className="block space-y-1">
              <span className="text-xs text-muted">Prometheus datasource</span>
              <select
                className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
                value={selectedUid}
                onChange={(e) => setSelectedUid(e.target.value)}
              >
                <option value="">Select datasource…</option>
                {datasources.map((ds) => (
                  <option key={ds.uid} value={ds.uid}>
                    {ds.name}
                    {ds.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-xs text-muted">Service scopes (comma-separated, max 10)</span>
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-primary"
              placeholder="api-gateway, web-client"
              value={scopeInput}
              onChange={(e) => setScopeInput(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={probing || !selectedUid}
              onClick={testProbe}
            >
              {probing ? "Testing…" : "Test query"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="brand"
              disabled={saving || !selectedUid}
              onClick={saveConfig}
            >
              {saving ? "Saving…" : "Save metrics config"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loading}
              onClick={() => void loadDatasources()}
            >
              Refresh
            </Button>
          </div>
        </>
      ) : prometheusDatasource ? (
        <p className="text-xs text-secondary">
          Datasource: <span className="font-medium text-brand">{prometheusDatasource.name}</span>
        </p>
      ) : (
        <p className="text-xs text-muted">An org admin must configure metrics datasource.</p>
      )}

      {prometheusDatasource?.lastProbeSummary && (
        <p className="text-xs text-muted">Last probe: {prometheusDatasource.lastProbeSummary}</p>
      )}

      {metricsLastSyncSummary && (
        <p className="text-xs text-success-soft">{metricsLastSyncSummary}</p>
      )}

      {metricsLastError && (
        <p className="text-xs text-warning-soft">{metricsLastError}</p>
      )}

      {metricsSnapshot?.kpis && (
        <div className="flex flex-wrap gap-2 text-xs text-secondary">
          <span>Health {metricsSnapshot.kpis.healthScore}/100</span>
          <span>·</span>
          <span>P95 {metricsSnapshot.kpis.p95LatencyMs}ms</span>
          <span>·</span>
          <span>Error {metricsSnapshot.kpis.errorRate}%</span>
        </div>
      )}

      {message && (
        <p
          className={`text-xs ${
            message.toLowerCase().includes("fail") ||
            message.toLowerCase().includes("error") ||
            message.includes("rejected") ||
            message.includes("permission")
              ? "text-warning-soft"
              : "text-secondary"
          }`}
        >
          {message}
        </p>
      )}

      {selectedDs && !prometheusDatasource && (
        <p className="text-[11px] text-muted">
          Pre-selected {selectedDs.name} — save to enable metrics on sync.
        </p>
      )}
    </div>
  );
}
