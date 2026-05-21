"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GitHubRepoSummary } from "@/lib/integration-meta";

export function GitHubIntegrationPanel({
  connected,
  githubLogin,
  lastSyncSummary,
  repos,
  syncRepos,
  webhookUrl,
  oauthConfigured,
}: {
  connected: boolean;
  githubLogin?: string;
  lastSyncSummary?: string;
  repos?: GitHubRepoSummary[];
  /** From GITHUB_SYNC_REPOS — repos sync prioritizes for PRs / Actions */
  syncRepos?: string[];
  webhookUrl: string;
  oauthConfigured: boolean;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/github/sync", { method: "POST" });
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
    return oauthConfigured ? (
      <Button size="sm" asChild>
        <Link href="/api/integrations/github/authorize">Connect with GitHub</Link>
      </Button>
    ) : (
      <p className="text-xs text-muted">Add GitHub OAuth credentials to .env to enable OAuth.</p>
    );
  }

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="brand" disabled={syncing} onClick={sync}>
          <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {syncing ? "Syncing…" : "Sync repositories"}
        </Button>
        {githubLogin && (
          <Button size="sm" variant="ghost" asChild>
            <a
              href={`https://github.com/${githubLogin}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              @{githubLogin}
              <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>

      {repos && repos.length > 0 && (
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
      )}

      <div className="rounded-lg border border-border bg-elevated/40 p-3">
        <p className="text-xs font-medium text-primary">Webhook URL (optional)</p>
        <p className="mt-1 break-all font-mono text-[11px] text-muted">{webhookUrl}</p>
        <p className="mt-2 text-[11px] text-muted">
          In GitHub → Settings → Webhooks, paste this URL. Events: push, pull_request,
          workflow_run. Set secret to <code className="text-brand">GITHUB_WEBHOOK_SECRET</code>.
        </p>
      </div>
    </div>
  );
}
