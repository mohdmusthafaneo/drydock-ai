"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WORKFLOW_MODES } from "@/lib/agents";
import type { AutonomyMode } from "@/generated/prisma/client";

type WorkflowExecutionStatus = "ACTIVE" | "PAUSED" | "COMPLETED";

const selectClass =
  "flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

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
        <p className="mb-3 text-sm font-medium text-ink">Workflow execution</p>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as WorkflowExecutionStatus)}
          className={selectClass}
        >
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-ink">AI autonomy mode (Master FRD §10)</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {WORKFLOW_MODES.map((w) => (
            <button
              key={w.mode}
              type="button"
              onClick={() => setMode(w.mode as AutonomyMode)}
              className={cn(
                "rounded-[16px] border p-3 text-left text-sm transition-colors",
                mode === w.mode
                  ? "border-rust/30 bg-apricot-wash text-ink"
                  : "border-border-subtle bg-fog text-ink hover:bg-hover",
              )}
            >
              <p className="font-medium">{w.label}</p>
              <p className="mt-1 text-xs text-muted">{w.description}</p>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}
      <Button onClick={save} disabled={loading} variant="brown" size="lg">
        {loading ? "Saving…" : "Save workflow configuration"}
      </Button>
    </div>
  );
}
