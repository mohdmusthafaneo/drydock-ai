"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { AgentHirePayload } from "@/lib/agent-control-plane/hire";

export function AgentHireApprovalCard({
  approvalId,
  title,
  payload,
}: {
  approvalId: string;
  title: string;
  payload: AgentHirePayload;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAgentsMd, setShowAgentsMd] = useState(true);

  const agentsMd = payload.instructionsBundle?.files?.["AGENTS.md"] ?? "";

  async function decide(decision: "APPROVED" | "REJECTED") {
    setLoading(true);
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ approvalId, decision, comment }),
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border-subtle bg-sky-wash/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="ai">Agent hire</Badge>
        <p className="text-sm font-medium text-primary">{title}</p>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Role</dt>
          <dd className="text-primary">{payload.role.replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Display name</dt>
          <dd className="text-primary">{payload.displayName}</dd>
        </div>
        {payload.capabilities && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Capabilities</dt>
            <dd className="text-secondary">{payload.capabilities}</dd>
          </div>
        )}
        {(payload.desiredSkills?.length ?? 0) > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Skills</dt>
            <dd className="text-secondary">{payload.desiredSkills!.join(", ")}</dd>
          </div>
        )}
      </dl>

      {agentsMd && (
        <div className="space-y-2">
          <button
            type="button"
            className="text-xs font-medium text-ink underline-offset-4 hover:underline"
            onClick={() => setShowAgentsMd((v) => !v)}
          >
            {showAgentsMd ? "Hide" : "Show"} AGENTS.md preview
          </button>
          {showAgentsMd && (
            <pre className="max-h-64 overflow-auto rounded-xl border border-border-subtle bg-pure-white p-3 text-xs leading-relaxed whitespace-pre-wrap text-secondary">
              {agentsMd}
            </pre>
          )}
        </div>
      )}

      <Textarea
        placeholder="Optional comment for audit log…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button size="sm" variant="ink" disabled={loading} onClick={() => decide("APPROVED")}>
          Approve hire
        </Button>
        <Button
          size="sm"
          variant="link"
          className="h-auto px-0 text-error"
          disabled={loading}
          onClick={() => decide("REJECTED")}
        >
          Reject hire
        </Button>
      </div>
    </div>
  );
}
