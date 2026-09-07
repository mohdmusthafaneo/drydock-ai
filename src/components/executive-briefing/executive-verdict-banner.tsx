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
      <span
        className={cn(
          "inline-flex items-center rounded-[8px] border px-2.5 py-1 text-[11px] font-medium leading-none",
          VERDICT_BADGE[verdict],
        )}
      >
        {verdictLabel}
      </span>
      <h2 className="mt-3 text-[18px] font-semibold leading-[1.25] tracking-[-0.2px] text-ink">
        {headline}
      </h2>
      <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-secondary">{subcopy}</p>
    </RevealSection>
  );
}
