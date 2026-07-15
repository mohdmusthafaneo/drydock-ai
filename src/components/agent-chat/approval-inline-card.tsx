"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { invalidateThreadDetail } from "@/lib/queries/invalidate";
import type { ApprovalDecision, ApprovalType } from "@/generated/prisma/client";
import { readJsonField } from "@/lib/json-field";

export type ThreadApprovalSnapshot = {
  id: string;
  type: ApprovalType;
  title: string | null;
  decision: ApprovalDecision | null;
  payloadJson: unknown;
  recommendation: { title: string; requiredRole: string | null } | null;
};

type ApprovalInlineCardProps = {
  threadId: string;
  approvalId: string;
  title: string;
  contentMarkdown: string;
  type: ApprovalType;
  decision: ApprovalDecision | null;
  requiredRole?: string | null;
};

function requiredRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  return role.replace(/_/g, " ");
}

export function resolveApprovalTitle(
  _contentMarkdown: string,
  approval: ThreadApprovalSnapshot | null,
): string {
  if (!approval) return "Approval request";
  return approval.recommendation?.title ?? approval.title ?? "Approval request";
}

export function resolveApprovalRequiredRole(
  approval: ThreadApprovalSnapshot | null,
): string | null {
  if (!approval) return null;
  if (approval.recommendation?.requiredRole) {
    return approval.recommendation.requiredRole;
  }
  if (approval.type === "AGENT_ACTION") {
    const parsed = readJsonField<{ requiredRole?: string }>(approval.payloadJson, {});
    return parsed.requiredRole ?? null;
  }
  return null;
}

export function ApprovalInlineCard({
  threadId,
  approvalId,
  title,
  contentMarkdown,
  decision,
  requiredRole,
}: ApprovalInlineCardProps) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPending = !decision;
  const roleHint = requiredRoleLabel(requiredRole);

  async function decide(nextDecision: "APPROVED" | "REJECTED" | "MODIFIED") {
    setLoading(true);
    setError(null);

    const res = await fetch(
      `/api/agent-threads/${threadId}/approvals/${approvalId}/decide`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ decision: nextDecision, comment }),
      },
    );

    setLoading(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to submit decision");
      return;
    }

    await invalidateThreadDetail(queryClient, threadId);
  }

  if (!isPending) {
    return (
      <div className="mx-auto max-w-lg rounded-[var(--radius-card)] border border-border-subtle bg-fog px-4 py-3 text-center shadow-[var(--shadow-subtle)]">
        <p className="text-xs font-medium uppercase tracking-wide text-graphite">
          Approval {decision?.toLowerCase()}
        </p>
        <p className="mt-1 text-sm text-ink">{title}</p>
        <Link
          href="/approvals"
          className="mt-2 inline-block text-xs font-medium text-ink underline-offset-4 hover:underline"
        >
          View in Approval Center
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-chart-blue/25 bg-pure-white px-4 py-4 shadow-[var(--shadow-subtle)]">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-chart-blue">
          Approval required
        </p>
        <p className="text-sm font-medium text-ink">{title}</p>
        {roleHint && (
          <p className="text-xs text-graphite">Requires {roleHint} or admin</p>
        )}
      </div>

      <div className="rounded-xl bg-sky-wash/60 px-3 py-2 text-sm text-ash">
        <MarkdownContent content={contentMarkdown} className="text-sm" />
      </div>

      <Textarea
        placeholder="Optional comment for audit log…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ink" className="rounded-full" disabled={loading} onClick={() => decide("APPROVED")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="rounded-full"
          disabled={loading}
          onClick={() => decide("MODIFIED")}
        >
          Modify
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="rounded-full text-error"
          disabled={loading}
          onClick={() => decide("REJECTED")}
        >
          Reject
        </Button>
        <Link
          href="/approvals"
          className="ml-auto text-xs font-medium text-graphite underline-offset-4 hover:text-ink hover:underline"
        >
          Approval Center
        </Link>
      </div>
    </div>
  );
}
