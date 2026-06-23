"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, RefreshCw, ShieldCheck, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DisconnectButton } from "@/components/integrations/integration-actions";
import { ExternalConnectLinkPanel } from "@/components/integrations/external-connect-link-panel";
import type { GitHubRepoSummary } from "@/lib/integration-meta";

type GitHubRepoOption = {
  fullName: string;
  private: boolean;
  defaultBranch: string;
};

export function GitHubIntegrationPanel({
  connected,
  lastSyncSummary,
  repos,
  selectedRepoFullNames,
  webhookUrl,
  webhookEnabled,
  appSlug,
  installationId,
  installedAt,
  canManage,
  installState,
  appUrlConfigured,
}: {
  connected: boolean;
  lastSyncSummary?: string;
  repos?: GitHubRepoSummary[];
  /** Org-selected sync targets from metadata.repoFullNames */
  selectedRepoFullNames?: string[];
  webhookUrl: string;
  webhookEnabled: boolean;
  appSlug?: string;
  installationId?: number;
  installedAt?: string;
  canManage: boolean;
  installState?: string;
  appUrlConfigured: boolean;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [availableRepos, setAvailableRepos] = useState<GitHubRepoOption[]>([]);
  const [pickedNames, setPickedNames] = useState<string[]>(selectedRepoFullNames ?? []);
  const [maxRepos, setMaxRepos] = useState(10);

  const savedNames = selectedRepoFullNames ?? [];
  const hasSelection = savedNames.length > 0;

  const installUrl = appSlug
    ? installState
      ? `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(installState)}`
      : `https://github.com/apps/${appSlug}/installations/new`
    : null;
  const manageUrl =
    appSlug && installationId
      ? `https://github.com/apps/${appSlug}/installations/${installationId}`
      : null;

  const loadRepos = useCallback(async () => {
    if (!connected || !canManage || !installationId) return;
    setLoadingRepos(true);
    try {
      const res = await fetch("/api/integrations/github/repos", {
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load repositories");
      setAvailableRepos(data.repos ?? []);
      setPickedNames(data.selectedFullNames ?? []);
      if (data.maxRepos) setMaxRepos(data.maxRepos);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load repositories");
    } finally {
      setLoadingRepos(false);
    }
  }, [connected, canManage, installationId]);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  useEffect(() => {
    setPickedNames(selectedRepoFullNames ?? []);
  }, [selectedRepoFullNames]);

  function toggleRepo(fullName: string) {
    setPickedNames((prev) => {
      if (prev.includes(fullName)) {
        return prev.filter((n) => n !== fullName);
      }
      if (prev.length >= maxRepos) {
        setMessage(`You can sync up to ${maxRepos} repositories`);
        return prev;
      }
      return [...prev, fullName];
    });
  }

  async function saveSelection() {
    if (pickedNames.length === 0) {
      setMessage("Select at least one repository");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/github/repos", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoFullNames: pickedNames }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save selection");
      setMessage(`Saved ${data.repoFullNames.length} repository(ies) for sync`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save selection");
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    if (!hasSelection) {
      setMessage("Save at least one repository before syncing");
      return;
    }
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/github/sync", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setMessage(data.summary ?? `Synced ${data.repoCount} repos`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (!connected) {
    if (!installUrl) {
      if (!canManage) {
        return (
          <p className="text-xs text-muted">
            GitHub App installation is not yet configured for this workspace.
          </p>
        );
      }

      return (
        <p className="text-xs text-muted">
          Set <code>GITHUB_APP_SLUG</code> in <code>.env</code> to enable the GitHub App install.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Install the AIDOS GitHub App to grant read access to PRs, commits, and Actions across the
          repositories you select. Approval is per-organization and managed by your GitHub admin.
        </p>
        <Button size="sm" asChild>
          <Link href={installUrl}>Install GitHub App</Link>
        </Button>
        <ExternalConnectLinkPanel
          provider="GITHUB"
          connected={connected}
          canManage={canManage}
          appUrlConfigured={appUrlConfigured}
          providerConfigured={Boolean(appSlug)}
          providerConfigHint="Set GITHUB_APP_SLUG in .env."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">GitHub App</Badge>
          {webhookEnabled && (
            <Badge variant="success">
              <Webhook className="mr-1 h-3 w-3" />
              Webhooks
            </Badge>
          )}
          <Badge variant="muted">
            <ShieldCheck className="mr-1 h-3 w-3" />
            Org-scoped
          </Badge>
        </div>

        {installationId && (
          <p className="text-xs text-secondary">
            Installation{" "}
            <code className="rounded bg-base px-1.5 py-0.5 font-mono text-[11px] text-chart-blue">
              #{installationId}
            </code>
            {installedAt && (
              <span className="text-muted"> · installed {formatDate(installedAt)}</span>
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {manageUrl && (
            <Button size="sm" variant="ghost" asChild>
              <a href={manageUrl} target="_blank" rel="noopener noreferrer">
                Manage on GitHub
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          {installUrl && (
            <Button size="sm" variant="ghost" asChild>
              <a href={installUrl} target="_blank" rel="noopener noreferrer">
                Add repositories
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          {canManage && <DisconnectButton provider="GITHUB" />}
        </div>
      </div>

      {/* Repository picker — per org, not platform env */}
      <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
        <p className="text-xs font-medium text-primary">Repositories to sync</p>
        <p className="text-xs text-muted">
          Choose which GitHub repositories this organization syncs. Each org manages its own
          selection — same pattern as Jira project picker.
        </p>

        {!canManage ? (
          <p className="text-xs text-muted">
            {hasSelection
              ? `Syncing: ${savedNames.join(", ")}`
              : "An org admin must select repositories before syncing."}
          </p>
        ) : loadingRepos ? (
          <p className="text-xs text-muted">Loading repositories from GitHub…</p>
        ) : availableRepos.length === 0 ? (
          <p className="text-xs text-muted">
            No repositories visible to the App. Use <strong>Add repositories</strong> on GitHub to
            grant access, then refresh this page.
          </p>
        ) : (
          <>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-base/50 p-2">
              {availableRepos.map((r) => {
                const checked = pickedNames.includes(r.fullName);
                return (
                  <li key={r.fullName}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-elevated/60">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRepo(r.fullName)}
                        className="rounded border-border"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-primary">
                        {r.fullName}
                      </span>
                      {r.private && (
                        <Badge variant="muted" className="shrink-0 text-[10px]">
                          private
                        </Badge>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={saving || loadingRepos}
                onClick={saveSelection}
              >
                {saving ? "Saving…" : "Save selection"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loadingRepos}
                onClick={() => void loadRepos()}
              >
                Refresh list
              </Button>
            </div>
          </>
        )}
      </div>

      {lastSyncSummary && (
        <p className="text-xs text-success-soft">{lastSyncSummary}</p>
      )}
      {message && <p className="text-xs text-secondary">{message}</p>}

      {canManage && installationId && (
        <Button
          type="button"
          size="sm"
          variant="brand"
          disabled={syncing || !hasSelection}
          onClick={sync}
        >
          <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {syncing ? "Syncing…" : "Sync repositories"}
        </Button>
      )}

      {repos && repos.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-primary">Last sync snapshot</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-elevated/50 p-2 text-xs">
            {repos.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 py-1 text-secondary">
                <span className="truncate font-medium text-primary">{r.fullName}</span>
                <span className="shrink-0 text-muted">
                  {r.openPrs != null ? `${r.openPrs} open PRs` : r.defaultBranch}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-border bg-elevated/40 p-3">
        <p className="text-xs font-medium text-primary">Webhook URL</p>
        <p className="mt-1 break-all font-mono text-[11px] text-muted">{webhookUrl}</p>
        <p className="mt-2 text-[11px] text-muted">
          Configured on the GitHub App. Events: push, pull_request, workflow_run.
        </p>
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
