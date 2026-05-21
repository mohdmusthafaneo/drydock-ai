"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { WORKSPACE_META, type WorkspaceMode } from "@/lib/workspace-mode";

export function ModeSwitcher({
  current,
  compact = false,
}: {
  current: WorkspaceMode;
  compact?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<WorkspaceMode | null>(null);

  async function switchMode(mode: WorkspaceMode) {
    if (mode === current) return;
    setLoading(mode);
    const res = await fetch("/api/org/workspace-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ workspaceMode: mode }),
    });
    const data = await res.json();
    setLoading(null);
    if (res.ok) {
      router.push(data.redirect || WORKSPACE_META[mode].homePath);
      router.refresh();
    }
  }

  const modes: WorkspaceMode[] = ["MVP", "ENTERPRISE"];

  if (compact) {
    return (
      <div className="flex rounded-lg border border-border bg-base p-0.5">
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={loading !== null}
            onClick={() => switchMode(mode)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              current === mode
                ? mode === "MVP"
                  ? "bg-mvp text-white"
                  : "bg-accent text-accent-foreground"
                : "text-muted hover:text-primary",
            )}
          >
            {mode === "MVP" ? "MVP" : "Enterprise"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {modes.map((mode) => {
        const meta = WORKSPACE_META[mode];
        const active = current === mode;
        return (
          <button
            key={mode}
            type="button"
            disabled={loading !== null}
            onClick={() => switchMode(mode)}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              active
                ? mode === "MVP"
                  ? "border-mvp/50 bg-mvp-muted"
                  : "border-accent/50 bg-accent/10"
                : "border-border bg-elevated hover:bg-hover",
            )}
          >
            <p className="font-medium text-primary">{meta.label}</p>
            <p className="mt-1 text-xs text-muted">{meta.tagline}</p>
            <p className="mt-2 text-sm text-secondary">{meta.description}</p>
          </button>
        );
      })}
    </div>
  );
}
