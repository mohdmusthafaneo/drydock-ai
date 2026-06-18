import { cn } from "@/lib/utils";
import type { HealthBand } from "@/lib/executive-briefing/types";

type Props = {
  score: number | null;
  band: HealthBand | null;
  bandLabel: string | null;
  visible: boolean;
  className?: string;
};

const BAND_COLORS: Record<HealthBand, string> = {
  strong: "bg-success",
  steady: "bg-accent",
  caution: "bg-warning",
  at_risk: "bg-error",
};

const BAND_TEXT: Record<HealthBand, string> = {
  strong: "text-success",
  steady: "text-accent",
  caution: "text-warning",
  at_risk: "text-error",
};

export function DeliveryHealthGauge({ score, band, bandLabel, visible, className }: Props) {
  if (!visible || score == null || !band) {
    return (
      <div
        className={cn(
          "flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-elevated/40 px-6 py-8 text-center",
          className,
        )}
      >
        <p className="text-sm font-medium text-secondary">Delivery confidence</p>
        <p className="mt-2 max-w-[12rem] text-xs text-muted">
          Connect integrations and assess a release to see your health score.
        </p>
      </div>
    );
  }

  const fillPct = Math.max(8, Math.min(100, score));

  return (
    <div
      className={cn("flex flex-col items-center gap-4", className)}
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Delivery confidence ${score} out of 100, ${bandLabel ?? band}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Delivery confidence</p>
      <div className="relative flex h-52 w-16 items-end justify-center rounded-full border border-border bg-surface p-1.5 shadow-inner">
        <div
          className={cn(
            "w-full rounded-full transition-all duration-700 ease-out",
            BAND_COLORS[band],
          )}
          style={{ height: `${fillPct}%` }}
        />
      </div>
      <div className="text-center">
        <p className="text-3xl font-semibold tracking-tight">{score}</p>
        <p className={cn("mt-0.5 text-sm font-medium", BAND_TEXT[band])}>{bandLabel}</p>
      </div>
    </div>
  );
}
