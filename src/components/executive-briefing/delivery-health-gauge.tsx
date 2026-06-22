"use client";

import { cn } from "@/lib/utils";
import type { HealthBand } from "@/lib/executive-briefing/types";
import { AnimatedGaugeDisplay } from "@/components/motion/animated-gauge";

type Props = {
  score: number | null;
  band: HealthBand | null;
  bandLabel: string | null;
  visible: boolean;
  className?: string;
};

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

export function DeliveryHealthGauge({ score, band, bandLabel, visible, className }: Props) {
  if (!visible || score == null || !band) {
    return (
      <div
        className={cn(
          "flex h-full min-h-[240px] flex-col items-center justify-center rounded-[24px] border border-dashed border-dove bg-pure-white px-6 py-8 text-center shadow-[var(--shadow)]",
          className,
        )}
      >
        <p className="text-[15px] font-medium text-ink">Delivery confidence</p>
        <p className="mt-2 max-w-[14rem] text-[14px] leading-relaxed text-graphite">
          Connect integrations and assess a release to see your health score.
        </p>
      </div>
    );
  }

  const fillPct = Math.max(8, Math.min(100, score));

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-5 rounded-[24px] bg-apricot-wash px-6 py-8",
        className,
      )}
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Delivery confidence ${score} out of 100, ${bandLabel ?? band}`}
    >
      <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-graphite">
        Delivery confidence
      </p>
      <AnimatedGaugeDisplay
        fillPct={fillPct}
        fillClassName={BAND_FILL[band]}
        score={score}
        bandLabel={bandLabel}
        bandTextClassName={BAND_TEXT[band]}
      />
    </div>
  );
}
