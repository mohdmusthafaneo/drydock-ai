"use client";

import { cn } from "@/lib/utils";
import type { BriefingClaimVerdict } from "@/lib/executive-briefing/types";
import { RevealSection } from "@/components/motion/reveal-section";

const VERDICT_BADGE: Record<BriefingClaimVerdict, string> = {
  good: "border-dove/50 bg-fog text-ash",
  attention: "border-apricot/40 bg-apricot-wash/60 text-rust",
  risk: "border-rust/25 bg-rust/8 text-rust",
  neutral: "border-dove/50 bg-fog text-graphite",
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
        "rounded-[24px] border border-border-subtle bg-pure-white px-6 py-6 shadow-[var(--shadow)]",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
          VERDICT_BADGE[verdict],
        )}
      >
        {verdictLabel}
      </span>
      <h2 className="mt-3 font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
        {headline}
      </h2>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ash">{subcopy}</p>
    </RevealSection>
  );
}
