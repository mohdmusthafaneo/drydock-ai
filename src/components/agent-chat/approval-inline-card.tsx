"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { invalidateThreadDetail } from "@/lib/queries/invalidate";
import { parseHirePayload } from "@/lib/agent-control-plane/hire-payload";
import type { ApprovalDecision, ApprovalType } from "@/generated/prisma/client";

export type ThreadApprovalSnapshot = {
  id: string;
  type: ApprovalType;
  title: string | null;
  decision: ApprovalDecision | null;
  payloadJson: string;
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

  if (approval.type === "AGENT_HIRE") {
    const payload = parseHirePayload(approval.payloadJson);
    return approval.title ?? `Hire agent: ${payload?.displayName ?? "specialist"}`;
  }

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
    try {
      const parsed = JSON.parse(approval.payloadJson) as { requiredRole?: string };
      return parsed.requiredRole ?? null;
    } catch {
      return null;
    }
  }
  if (approval.type === "AGENT_HIRE") return "ORG_ADMIN";
  return null;
}

export function ApprovalInlineCard({
  threadId,
  approvalId,
  title,
  contentMarkdown,
  type,
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

  if (type === "AGENT_HIRE") {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-[#8B5CF6]/30 bg-[#131A2A]/90 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[#8B5CF6]">
          Agent hire approval
        </p>
        <p className="mt-1 text-sm font-medium text-slate-200">{title}</p>
        <p className="mt-2 text-xs text-slate-400">
          Agent hire decisions are managed in the Approval Center.
        </p>
        <Link
          href="/approvals"
          className="mt-3 inline-block text-xs text-brand hover:underline"
        >
          Open Approval Center →
        </Link>
      </div>
    );
  }

  if (!isPending) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-white/10 bg-[#131A2A]/80 px-4 py-3 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Approval {decision?.toLowerCase()}
        </p>
        <p className="mt-1 text-sm text-slate-300">{title}</p>
        <Link
          href="/approvals"
          className="mt-2 inline-block text-xs text-brand hover:underline"
        >
          View in Approval Center
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-xl border border-[#4F8CFF]/30 bg-[#131A2A]/90 px-4 py-4">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">
          Approval required
        </p>
        <p className="text-sm font-medium text-slate-100">{title}</p>
        {roleHint && (
          <p className="text-xs text-slate-500">Requires {roleHint} or admin</p>
        )}
      </div>

      <div className="text-sm text-slate-300">
        <MarkdownContent content={contentMarkdown} className="text-sm" />
      </div>

      <Textarea
        placeholder="Optional comment for audit log…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={loading} onClick={() => decide("APPROVED")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading}
          onClick={() => decide("MODIFIED")}
        >
          Modify
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={loading}
          onClick={() => decide("REJECTED")}
        >
          Reject
        </Button>
        <Link
          href="/approvals"
          className="ml-auto text-xs text-slate-400 hover:text-brand hover:underline"
        >
          Approval Center
        </Link>
      </div>
    </div>
  );
}
