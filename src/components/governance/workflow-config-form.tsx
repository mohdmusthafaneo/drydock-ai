"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { WORKFLOW_MODES } from "@/lib/agents";
import type { AutonomyMode } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

type WorkflowExecutionStatus = "ACTIVE" | "PAUSED" | "COMPLETED";

function normalizeExecutionStatus(status: string): WorkflowExecutionStatus {
  if (status === "PAUSED" || status === "COMPLETED") return status;
  return "ACTIVE";
}

export function WorkflowConfigForm({
  currentMode,
  executionStatus,
}: {
  currentMode: AutonomyMode;
  executionStatus: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<AutonomyMode>(currentMode);
  const [status, setStatus] = useState<WorkflowExecutionStatus>(
    normalizeExecutionStatus(executionStatus),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/governance/workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autonomyMode: mode,
        executionStatus: status,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to save");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-sm font-medium text-slate-300">Workflow execution</p>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as WorkflowExecutionStatus)}
          className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
        >
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-slate-300">AI autonomy mode (Master FRD §10)</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {WORKFLOW_MODES.map((w) => (
            <button
              key={w.mode}
              type="button"
              onClick={() => setMode(w.mode as AutonomyMode)}
              className={cn(
                "rounded-xl border p-3 text-left text-sm transition-colors",
                mode === w.mode
                  ? "border-[#4F8CFF]/50 bg-[#4F8CFF]/10"
                  : "border-white/10 hover:border-white/20",
              )}
            >
              <p className="font-medium">{w.label}</p>
              <p className="mt-1 text-xs text-slate-500">{w.description}</p>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button onClick={save} disabled={loading}>
        {loading ? "Saving…" : "Save workflow configuration"}
      </Button>
    </div>
  );
}
