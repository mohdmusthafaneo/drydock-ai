"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DisconnectButton,
  JiraOAuthConnect,
} from "@/components/integrations/integration-actions";
import { ExternalConnectLinkPanel } from "@/components/integrations/external-connect-link-panel";
import type { JiraDeliverySnapshot } from "@/lib/jira-meta";

type JiraProjectOption = { key: string; name: string };

export function JiraIntegrationPanel({
  connected,
  configured,
  siteName,
  siteUrl,
  displayName,
  connectedAt,
  connectionStatus,
  lastError,
  lastSyncSummary,
  selectedProjectKeys,
  deliverySnapshot,
  availableSitesCount,
  canManage,
  appUrlConfigured,
}: {
  connected: boolean;
  configured: boolean;
  siteName?: string;
  siteUrl?: string;
  displayName?: string;
  connectedAt?: string;
  connectionStatus?: "ok" | "error";
  lastError?: string;
  lastSyncSummary?: string;
  /** Org-selected sync targets from metadata.projectKeys */
  selectedProjectKeys?: string[];
  deliverySnapshot?: JiraDeliverySnapshot;
  availableSitesCount?: number;
  canManage: boolean;
  appUrlConfigured: boolean;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<JiraProjectOption[]>([]);
  const [pickedKeys, setPickedKeys] = useState<string[]>(selectedProjectKeys ?? []);
  const [maxProjects, setMaxProjects] = useState(10);

  const savedKeys = selectedProjectKeys ?? [];
  const hasSelection = savedKeys.length > 0;

  const loadProjects = useCallback(async () => {
    if (!connected || !canManage) return;
    setLoadingProjects(true);
    try {
      const res = await fetch("/api/integrations/jira/projects", {
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load projects");
      setProjects(data.projects ?? []);
      setPickedKeys(data.selectedKeys ?? []);
      if (data.maxProjects) setMaxProjects(data.maxProjects);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoadingProjects(false);
    }
  }, [connected, canManage]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    setPickedKeys(selectedProjectKeys ?? []);
  }, [selectedProjectKeys]);

  function toggleProject(key: string) {
    setPickedKeys((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= maxProjects) {
        setMessage(`You can sync up to ${maxProjects} projects`);
        return prev;
      }
      return [...prev, key];
    });
  }

  async function saveSelection() {
    if (pickedKeys.length === 0) {
      setMessage("Select at least one project");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/jira/projects", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectKeys: pickedKeys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save selection");
      setMessage(`Saved ${data.projectKeys.length} project(s) for sync`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save selection");
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    if (!hasSelection) {
      setMessage("Save at least one project before syncing");
      return;
    }
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/jira/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setMessage(data.summary ?? "Jira sync complete");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

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
        <ExternalConnectLinkPanel
          provider="JIRA"
          connected={connected}
          canManage={canManage}
          appUrlConfigured={appUrlConfigured}
          providerConfigured={configured}
          providerConfigHint="Set ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET in .env."
        />
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

        {lastError && connectionStatus !== "error" && lastError.toLowerCase().includes("scope") && (
          <p className="text-xs text-warning-soft">
            {lastError} Disconnect and connect again after updating scopes in the Atlassian
            developer console.
          </p>
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

      {/* Project picker — per org, not platform env */}
      <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
        <p className="text-xs font-medium text-primary">Projects to sync</p>
        <p className="text-xs text-muted">
          Choose which Jira projects this organization syncs. Each org manages its own selection.
        </p>

        {canManage ? (
          <>
            {loadingProjects ? (
              <p className="text-xs text-muted">Loading projects from Jira…</p>
            ) : projects.length === 0 ? (
              <p className="text-xs text-muted">
                No projects found on this site, or unable to load the list.
              </p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-base/50 p-2">
                {projects.map((p) => {
                  const checked = pickedKeys.includes(p.key);
                  const atLimit = !checked && pickedKeys.length >= maxProjects;
                  return (
                    <li key={p.key}>
                      <label
                        className={`flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-xs ${
                          atLimit ? "cursor-not-allowed opacity-50" : "hover:bg-elevated/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-brand"
                          checked={checked}
                          disabled={atLimit}
                          onChange={() => toggleProject(p.key)}
                        />
                        <span>
                          <span className="font-medium text-primary">{p.key}</span>
                          {p.name !== p.key && (
                            <span className="text-muted"> · {p.name}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={saving || loadingProjects || pickedKeys.length === 0}
                onClick={saveSelection}
              >
                {saving ? "Saving…" : "Save selection"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loadingProjects}
                onClick={() => void loadProjects()}
              >
                Refresh list
              </Button>
            </div>
          </>
        ) : savedKeys.length > 0 ? (
          <p className="text-xs text-secondary">
            Sync targets:{" "}
            {savedKeys.map((key, i) => (
              <span key={key}>
                {i > 0 ? ", " : null}
                <span className="font-medium text-brand">{key}</span>
              </span>
            ))}
          </p>
        ) : (
          <p className="text-xs text-muted">No projects selected yet.</p>
        )}
      </div>

      {hasSelection && (
        <p className="text-xs text-muted">
          Sync targets:{" "}
          {savedKeys.map((key, i) => (
            <span key={key}>
              {i > 0 ? ", " : null}
              <span className="font-medium text-brand">{key}</span>
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
          {syncing ? "Syncing…" : "Sync Jira data"}
        </Button>
      )}

      {!canManage && !hasSelection && (
        <p className="text-xs text-muted">An org admin must select projects before sync.</p>
      )}

      {deliverySnapshot && deliverySnapshot.projects.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-primary">Delivery snapshot</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-elevated/50 p-2 text-xs">
            {deliverySnapshot.projects.map((p) => (
              <li key={p.key} className="flex justify-between gap-2 py-1 text-secondary">
                <span className="truncate font-medium text-primary">
                  {p.key}
                  {p.name !== p.key ? ` · ${p.name}` : ""}
                </span>
                <span className="shrink-0 text-muted">
                  {p.openIssues} open
                  {p.blockedCount > 0 ? ` · ${p.blockedCount} blocked` : ""}
                </span>
              </li>
            ))}
          </ul>
          {deliverySnapshot.syncedAt && (
            <p className="text-[11px] text-muted">
              Snapshot from {formatDate(deliverySnapshot.syncedAt)}
            </p>
          )}
        </div>
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
