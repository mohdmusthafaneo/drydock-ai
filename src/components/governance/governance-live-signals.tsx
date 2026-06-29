"use client";

import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import type { BriefingHighlight, HealthBand } from "@/lib/executive-briefing/types";
import { cn } from "@/lib/utils";

const BAND_FILL: Record<HealthBand, string> = {
  strong: "bg-rust",
  steady: "bg-[#8b5a3c]",
  caution: "bg-[#c49a7a]",
  at_risk: "bg-[#3d1f14]",
};

const BAND_TEXT: Record<HealthBand, string> = {
  strong: "text-rust",
  steady: "text-ash",
  caution: "text-ash",
  at_risk: "text-rust",
};

export function GovernanceLiveSignals({
  highlights,
  score,
  band,
  bandLabel,
}: {
  highlights: BriefingHighlight[];
  score: number;
  band: HealthBand;
  bandLabel: string;
}) {
  const fillPct = Math.max(8, Math.min(100, score));

  return (
    <div className="overflow-hidden rounded-[24px] border border-border-subtle bg-pure-white shadow-[var(--shadow)]">
      <BriefingHighlights highlights={highlights} bare />
      <div
        className="flex items-center justify-between gap-4 border-t border-border-subtle bg-apricot-wash/40 px-5 py-3"
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Governance score ${score} out of 100, ${bandLabel}`}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
            Governance score
          </p>
          <p className="mt-0.5 text-[13px] text-ash">From your Delivery DNA profile</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-pure-white/90 sm:block">
            <div
              className={cn("h-full rounded-full transition-all", BAND_FILL[band])}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <div className="text-right">
            <p className="font-display text-[28px] leading-none tracking-[-0.42px] tabular-nums text-ink">
              {score}
            </p>
            <p className={cn("mt-0.5 text-[13px] font-medium", BAND_TEXT[band])}>{bandLabel}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
