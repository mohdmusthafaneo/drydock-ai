"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DisconnectButton } from "@/components/integrations/integration-actions";
import { formatFixedLocaleDateTime } from "@/lib/format-date";

export function AwsIntegrationPanel({
  connected,
  trulyConnected,
  roleArn,
  accountIdHint,
  externalIdMasked,
  connectedAt,
  lastScanSummary,
  lastScanAt,
  canManage,
  trustedAccountId,
}: {
  connected: boolean;
  trulyConnected: boolean;
  roleArn?: string;
  accountIdHint?: string;
  externalIdMasked?: string;
  connectedAt?: string;
  lastScanSummary?: string;
  lastScanAt?: string;
  canManage: boolean;
  trustedAccountId?: string | null;
}) {
  const router = useRouter();
  const [arn, setArn] = useState(roleArn ?? "");
  const [externalId, setExternalId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setArn(roleArn ?? "");
  }, [roleArn]);

  async function save() {
    if (!arn.trim()) {
      setMessage("Enter the IAM role ARN to assume");
      return;
    }
    if (!externalId.trim() && !trulyConnected) {
      setMessage("Enter the External ID required by the role trust policy");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/aws/connect", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleArn: arn.trim(),
          externalId: externalId.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMessage("AWS role saved — run a DevOps agent scan or open Cloud hygiene");
      setExternalId("");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!connected || !trulyConnected) {
    if (!canManage) {
      return (
        <p className="text-xs text-muted">
          AWS account scanning is not configured. An org admin can store the assume-role ARN
          and External ID here.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Store the customer IAM role AIDOS assumes for multi-region inventory and hygiene
          scans. The role trust policy must allow AIDOS
          {trustedAccountId ? (
            <>
              {" "}
              account <code className="text-secondary">{trustedAccountId}</code>
            </>
          ) : null}{" "}
          and require the External ID you enter below.
        </p>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-primary">Role ARN</span>
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-base px-3 py-2 font-mono text-sm text-primary"
            placeholder="arn:aws:iam::123456789012:role/AidosScanRole"
            value={arn}
            onChange={(e) => setArn(e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-primary">External ID</span>
          <input
            type="password"
            className="w-full rounded-lg border border-border bg-base px-3 py-2 font-mono text-sm text-primary"
            placeholder="Shared secret from the trust policy"
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            autoComplete="off"
          />
        </label>

        {message && (
          <p
            className={`text-xs ${
              message.toLowerCase().includes("fail") ||
              message.toLowerCase().includes("enter") ||
              message.toLowerCase().includes("invalid")
                ? "text-warning-soft"
                : "text-secondary"
            }`}
          >
            {message}
          </p>
        )}

        <Button type="button" size="sm" variant="brand" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save AWS role"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">AWS · assume role</Badge>
          <Badge variant="success">Configured</Badge>
        </div>

        {accountIdHint && (
          <p className="text-xs text-secondary">Account: {accountIdHint}</p>
        )}
        {roleArn && (
          <p className="break-all font-mono text-xs text-muted">{roleArn}</p>
        )}
        {externalIdMasked && (
          <p className="text-xs text-muted">External ID: {externalIdMasked}</p>
        )}
        {connectedAt && (
          <p className="text-xs text-muted">Connected {formatDate(connectedAt)}</p>
        )}
        {lastScanAt && (
          <p className="text-xs text-muted">Last scan {formatDate(lastScanAt)}</p>
        )}
        {lastScanSummary && (
          <p className="text-xs text-success-soft">{lastScanSummary}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button size="sm" variant="secondary" asChild>
            <Link href="/devops">View cloud hygiene</Link>
          </Button>
          {canManage && <DisconnectButton provider="AWS" />}
          <p className="text-xs text-muted">
            Advanced:{" "}
            <Link href="/agent-threads/new" className="underline-offset-4 hover:underline">
              run in Conversations
            </Link>
          </p>
        </div>
      </div>

      {canManage && (
        <details className="rounded-lg border border-border bg-elevated/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-primary">
            Update role credentials
          </summary>
          <div className="mt-3 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-primary">Role ARN</span>
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-base px-3 py-2 font-mono text-sm text-primary"
                value={arn}
                onChange={(e) => setArn(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-primary">
                New External ID (required to rotate)
              </span>
              <input
                type="password"
                className="w-full rounded-lg border border-border bg-base px-3 py-2 font-mono text-sm text-primary"
                placeholder="Enter to replace stored External ID"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                autoComplete="off"
              />
            </label>
            {message && (
              <p
                className={`text-xs ${
                  message.toLowerCase().includes("fail") ||
                  message.toLowerCase().includes("invalid")
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
              disabled={saving || !externalId.trim()}
              onClick={save}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <p className="text-[11px] text-muted">
              Re-enter the External ID to rotate the stored secret (role ARN can change with it).
            </p>
          </div>
        </details>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return formatFixedLocaleDateTime(iso);
}
