"use client";

import { cn } from "@/lib/utils";
import type { BriefingClaimVerdict } from "@/lib/executive-briefing/types";
import { RevealSection } from "@/components/motion/reveal-section";

const VERDICT_BADGE: Record<BriefingClaimVerdict, string> = {
  good: "border-border bg-success-soft text-success",
  attention: "border-accent-ring bg-accent-soft text-brown",
  risk: "border-[#ffe0d1] bg-[#fff0e8] text-coral",
  neutral: "border-border bg-elevated text-muted",
};

type Props = {
  verdict: BriefingClaimVerdict;
  verdictLabel: string;
  headline: string;
  subcopy: string;
  className?: string;
};

export function ExecutiveVerdictBanner({
  verdict,
  verdictLabel,
  headline,
  subcopy,
  className,
}: Props) {
  return (
    <RevealSection
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-pure-white px-6 py-6 shadow-[var(--shadow)]",
        className,
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex items-center rounded-[8px] border px-2.5 py-1 text-[11px] font-medium leading-none",
              VERDICT_BADGE[verdict],
            )}
          >
            {verdictLabel}
          </span>
          <h2 className="mt-3 text-[18px] font-semibold leading-[1.25] tracking-[-0.2px] text-ink sm:text-[20px]">
            {headline}
          </h2>
        </div>
        <p className="text-[15px] leading-relaxed text-secondary sm:text-[16px] lg:pt-8">
          {subcopy}
        </p>
      </div>
    </RevealSection>
  );
}
