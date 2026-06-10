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
    <div className="space-y-3 rounded-lg border border-[#8B5CF6]/30 bg-[#131A2A]/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="ai">Agent hire</Badge>
        <p className="text-sm font-medium">{title}</p>
      </div>

      <dl className="grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Role</dt>
          <dd className="text-slate-200">{payload.role.replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Display name</dt>
          <dd className="text-slate-200">{payload.displayName}</dd>
        </div>
        {payload.capabilities && (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Capabilities</dt>
            <dd className="text-slate-200">{payload.capabilities}</dd>
          </div>
        )}
        {payload.desiredSkills?.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Skills</dt>
            <dd className="text-slate-200">{payload.desiredSkills.join(", ")}</dd>
          </div>
        )}
      </dl>

      {agentsMd && (
        <div className="space-y-2">
          <button
            type="button"
            className="text-xs font-medium text-[#4F8CFF] hover:underline"
            onClick={() => setShowAgentsMd((v) => !v)}
          >
            {showAgentsMd ? "Hide" : "Show"} AGENTS.md preview
          </button>
          {showAgentsMd && (
            <pre className="max-h-64 overflow-auto rounded-md border border-white/8 bg-[#0B1020] p-3 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
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
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={loading} onClick={() => decide("APPROVED")}>
          Approve hire
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={loading}
          onClick={() => decide("REJECTED")}
        >
          Reject hire
        </Button>
      </div>
    </div>
  );
}
