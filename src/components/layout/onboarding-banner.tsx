"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronUp, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceMode } from "@/lib/workspace-mode";

type Step = { id: string; label: string; href: string; done: boolean };

export function OnboardingBanner({
  steps,
  workspaceMode,
  title,
}: {
  steps: Step[];
  workspaceMode: WorkspaceMode;
  title?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const nextStep = steps.find((s) => !s.done);

  if (allDone || !nextStep) return null;

  const isMvp = workspaceMode === "MVP";
  const defaultTitle = isMvp ? "Next on your launch path" : "Next in enterprise setup";

  return (
    <div
      className={cn(
        "mb-6 rounded-xl border p-4",
        isMvp ? "border-mvp/30 bg-mvp-muted" : "border-brand/30 bg-brand-muted",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium",
              isMvp ? "text-mvp" : "text-brand",
            )}
          >
            {title ?? defaultTitle}
          </p>
          <Link
            href={nextStep.href}
            className="mt-1 flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Circle className="h-4 w-4 shrink-0 text-muted" />
            {nextStep.label}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-elevated">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  isMvp ? "bg-mvp" : "bg-brand",
                )}
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted">
              {doneCount}/{steps.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-secondary hover:bg-hover hover:text-primary"
          >
            {expanded ? "Less" : "All steps"}
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <ul className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  step.done
                    ? "text-success"
                    : "bg-elevated text-primary hover:bg-hover",
                )}
              >
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted" />
                )}
                {step.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
