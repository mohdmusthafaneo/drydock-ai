"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function GovernanceEscalationPanel({
  escalation,
}: {
  escalation: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(escalation);

  if (entries.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="font-display text-[18px] leading-snug tracking-[-0.14px] text-ink">
            Approval paths
          </p>
          <p className="mt-1 text-[13px] text-graphite">
            Human escalation matrix by severity
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-graphite transition-transform",
            open && "rotate-180",
          )}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-5 py-4">
          {entries.map(([level, action]) => (
            <div
              key={level}
              className="flex justify-between rounded-[9px] bg-fog px-4 py-2 text-sm"
            >
              <span className="capitalize text-muted">{level}</span>
              <span className="text-ink">{action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
