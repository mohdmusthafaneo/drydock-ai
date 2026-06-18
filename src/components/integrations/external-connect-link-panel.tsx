"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ActiveInvite = {
  id: string;
  provider: "GITHUB" | "JIRA";
  expiresAt: string;
  createdAt: string;
  url: string;
};

export function ExternalConnectLinkPanel({
  provider,
  connected,
  canManage,
  appUrlConfigured,
  providerConfigured,
  providerConfigHint,
}: {
  provider: "GITHUB" | "JIRA";
  connected: boolean;
  canManage: boolean;
  appUrlConfigured: boolean;
  providerConfigured: boolean;
  providerConfigHint: string;
}) {
  const [invite, setInvite] = useState<ActiveInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadInvite = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/connect-invites?provider=${provider}`, {
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load invite");
      setInvite(data.invite ?? null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load invite");
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    if (connected || !canManage) {
      setLoading(false);
      return;
    }
    void loadInvite();
  }, [connected, canManage, loadInvite]);

  async function generateLink() {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/connect-invites", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setMessage("Integration is already connected.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to generate link");
      setInvite(data.invite);
      setMessage("Link generated — copy and send it to your admin contact.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to generate link");
    } finally {
      setGenerating(false);
    }
  }

  async function revokeLink() {
    setRevoking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/connect-invites/revoke", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, inviteId: invite?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke link");
      setInvite(null);
      setMessage("Link revoked.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to revoke link");
    } finally {
      setRevoking(false);
    }
  }

  async function copyLink() {
    if (!invite?.url) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Could not copy — select the URL and copy manually.");
    }
  }

  if (connected || !canManage) return null;

  const configReady = appUrlConfigured && providerConfigured;

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border bg-base/40 p-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-chart-blue" />
        <p className="text-xs font-medium text-primary">Share setup link</p>
      </div>
      <p className="text-xs text-muted">
        Send this link to someone with {provider === "JIRA" ? "Jira" : "GitHub"} admin access.
        Single-use, expires in 24 hours.
      </p>

      {!configReady && (
        <p className="text-xs text-warning-soft">
          {!appUrlConfigured && (
            <>
              Set <code>NEXT_PUBLIC_APP_URL</code> in <code>.env</code> before generating links.{" "}
            </>
          )}
          {!providerConfigured && providerConfigHint}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-muted">Loading active link…</p>
      ) : invite ? (
        <div className="space-y-2">
          <input
            readOnly
            value={invite.url}
            className="w-full rounded-lg border border-border bg-elevated px-2 py-1.5 font-mono text-[11px] text-secondary"
          />
          <p className="text-[11px] text-muted">
            Expires {new Date(invite.expiresAt).toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={copyLink}>
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={revoking}
              onClick={revokeLink}
            >
              <XCircle className="h-3.5 w-3.5" />
              {revoking ? "Revoking…" : "Revoke link"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={generating || !configReady}
          onClick={generateLink}
        >
          {generating ? "Generating…" : "Generate link"}
        </Button>
      )}

      {message && <p className="text-xs text-secondary">{message}</p>}
    </div>
  );
}
