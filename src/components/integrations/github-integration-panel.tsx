"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, RefreshCw, ShieldCheck, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DisconnectButton } from "@/components/integrations/integration-actions";
import type { GitHubRepoSummary } from "@/lib/integration-meta";

export function GitHubIntegrationPanel({
  connected,
  githubLogin,
  lastSyncSummary,
  repos,
  syncRepos,
  webhookUrl,
  webhookEnabled,
  appSlug,
  installationId,
  installedAt,
  mode,
  canManage,
}: {
  connected: boolean;
  githubLogin?: string;
  lastSyncSummary?: string;
  repos?: GitHubRepoSummary[];
  /** From GITHUB_SYNC_REPOS — repos sync prioritizes for PRs / Actions */
  syncRepos?: string[];
  webhookUrl: string;
  webhookEnabled: boolean;
  /** GitHub App slug, e.g. "aidos-neo" — used to build the install / manage URLs */
  appSlug?: string;
  installationId?: number;
  installedAt?: string;
  /** "oauth" | "app" | "dual" */
  mode?: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const installUrl = appSlug
    ? `https://github.com/apps/${appSlug}/installations/new`
    : null;
  const manageUrl =
    appSlug && installationId
      ? `https://github.com/apps/${appSlug}/installations/${installationId}`
      : null;

  const hasApp = Boolean(installationId);
  const hasOAuth = mode === "oauth" || mode === "dual";

  async function sync() {
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

  // ---------- Not connected ----------
  if (!connected) {
    if (!installUrl) {
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
      </div>
    );
  }

  // ---------- Connected ----------
  return (
    <div className="space-y-4">
      {/* Connection summary */}
      <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">
            {hasApp && hasOAuth ? "GitHub App + OAuth" : hasApp ? "GitHub App" : "OAuth"}
          </Badge>
          {webhookEnabled && (
            <Badge variant="success">
              <Webhook className="mr-1 h-3 w-3" />
              Webhooks
            </Badge>
          )}
          {hasApp && (
            <Badge variant="muted">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Org-scoped
            </Badge>
          )}
        </div>

        {hasApp && (
          <p className="text-xs text-secondary">
            Installation{" "}
            <code className="rounded bg-base px-1.5 py-0.5 font-mono text-[11px] text-brand">
              #{installationId}
            </code>
            {installedAt && (
              <span className="text-muted"> · installed {formatDate(installedAt)}</span>
            )}
          </p>
        )}

        {githubLogin && (
          <p className="text-xs text-secondary">
            OAuth user: <span className="text-primary">@{githubLogin}</span>
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

      {/* Sync targets (OAuth allowlist for now) */}
      {syncRepos && syncRepos.length > 0 && (
        <p className="text-xs text-muted">
          Sync targets:{" "}
          {syncRepos.map((r, i) => (
            <span key={r}>
              {i > 0 ? ", " : null}
              <a
                href={`https://github.com/${r}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                {r}
              </a>
            </span>
          ))}
        </p>
      )}

      {lastSyncSummary && (
        <p className="text-xs text-success-soft">{lastSyncSummary}</p>
      )}
      {message && <p className="text-xs text-secondary">{message}</p>}

      {/* Manual sync — requires OAuth token (App-only mode pulls signals via webhooks) */}
      {hasOAuth ? (
        <Button type="button" size="sm" variant="brand" disabled={syncing} onClick={sync}>
          <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {syncing ? "Syncing…" : "Sync repositories"}
        </Button>
      ) : (
        <p className="text-xs text-muted">
          Signals stream in over webhooks. Manual sync requires the legacy OAuth connection.
        </p>
      )}

      {/* Cached repo list (from previous OAuth sync, if any) */}
      {repos && repos.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-primary">Recent repositories</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-elevated/50 p-2 text-xs">
            {repos.slice(0, 10).map((r) => (
              <li key={r.id} className="flex justify-between gap-2 py-1 text-secondary">
                <span className="truncate font-medium text-primary">{r.fullName}</span>
                <span className="shrink-0 text-muted">
                  {r.openPrs != null ? `${r.openPrs} open` : r.defaultBranch}
                </span>
              </li>
            ))}
            {repos.length > 10 && (
              <li className="text-muted">+{repos.length - 10} more repositories</li>
            )}
          </ul>
        </div>
      )}

      {/* Webhook URL — only relevant for OAuth-mode webhook setup */}
      {hasOAuth && !hasApp && (
        <div className="rounded-lg border border-border bg-elevated/40 p-3">
          <p className="text-xs font-medium text-primary">Webhook URL (optional)</p>
          <p className="mt-1 break-all font-mono text-[11px] text-muted">{webhookUrl}</p>
          <p className="mt-2 text-[11px] text-muted">
            In GitHub → Settings → Webhooks, paste this URL. Events: push, pull_request,
            workflow_run. Set secret to <code className="text-brand">GITHUB_WEBHOOK_SECRET</code>.
          </p>
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
