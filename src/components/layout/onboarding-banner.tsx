"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronUp, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
type Step = { id: string; label: string; href: string; done: boolean };

export function OnboardingBanner({
  steps,
  title,
}: {
  steps: Step[];
  title?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const nextStep = steps.find((s) => !s.done);

  if (allDone || !nextStep) return null;

  const defaultTitle = "Next in setup";

  return (
    <div className="mb-4 rounded-[var(--radius-card)] border border-dove/50 bg-apricot-wash/40 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-graphite">
            {title ?? defaultTitle}
          </p>
          <Link
            href={nextStep.href}
            className="mt-1 flex items-center gap-2 text-[15px] font-medium text-ink hover:text-rust"
          >
            <Circle className="h-4 w-4 shrink-0 text-dove" strokeWidth={1.5} />
            {nextStep.label}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-fog">
              <div
                className="h-full rounded-full bg-rust transition-all"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
            <span className="text-[13px] text-graphite">
              {doneCount}/{steps.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium text-ash hover:bg-pure-white/60 hover:text-ink"
          >
            {expanded ? "Less" : "All steps"}
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <ul className="mt-4 grid gap-2 border-t border-dove/40 pt-4 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] transition-colors",
                  step.done
                    ? "text-success"
                    : "bg-pure-white/70 text-ink hover:bg-pure-white",
                )}
              >
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-dove" strokeWidth={1.5} />
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
