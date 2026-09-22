"use client";

import { cn } from "@/lib/utils";
import type { ProductivityTeamTotals } from "@/lib/productivity/types";

function formatHoursAsDays(hours: number | null): string {
  if (hours == null) return "—";
  const days = hours / 24;
  if (days < 10) return `${days.toFixed(1)}d`;
  return `${Math.round(days)}d`;
}

/** null = no prior sprint; undefined-like zero means flat. */
function formatDeltaDays(hoursDelta: number | null): string | null | undefined {
  if (hoursDelta == null) return null;
  const days = hoursDelta / 24;
  if (Math.abs(days) < 0.05) return undefined; // flat
  const abs = Math.abs(days);
  const formatted = abs < 10 ? abs.toFixed(1) : String(Math.round(abs));
  const sign = days > 0 ? "+" : "−";
  return `${sign}${formatted}d`;
}

function formatCountDelta(delta: number | null): string | null | undefined {
  if (delta == null) return null;
  if (delta === 0) return undefined;
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta)}`;
}

type KpiItem = {
  key: string;
  label: string;
  value: string;
  /** null = no prior; undefined = flat (hide); string = show delta */
  delta: string | null | undefined;
  invertGood: boolean;
};

function DeltaLine({
  delta,
  invertGood,
}: {
  delta: string | null | undefined;
  invertGood: boolean;
}) {
  if (delta === null) {
    return <p className="mt-1 text-[11px] leading-[15px] text-faint">No prior sprint</p>;
  }
  if (delta === undefined) {
    return <p className="mt-1 text-[11px] leading-[15px] text-faint">Flat vs prior</p>;
  }
  const up = delta.startsWith("+");
  const good = invertGood ? !up : up;
  return (
    <p className="mt-1 text-[11px] leading-[15px]">
      <span className={cn("font-medium", good ? "text-success" : "text-error")}>
        {delta}
      </span>
      <span className="text-muted"> vs prior</span>
    </p>
  );
}

export function ProductivityKpiStrip({
  totals,
  className,
}: {
  totals: ProductivityTeamTotals;
  className?: string;
}) {
  const items: KpiItem[] = [
    {
      key: "prs",
      label: "PRs merged",
      value: String(totals.prsMerged),
      delta: formatCountDelta(totals.prsMergedDelta),
      invertGood: false,
    },
    {
      key: "cycle",
      label: "Median cycle time",
      value: formatHoursAsDays(totals.medianCycleHours),
      delta: formatDeltaDays(totals.medianCycleHoursDelta),
      invertGood: true,
    },
    {
      key: "first",
      label: "Median time to first review",
      value: formatHoursAsDays(totals.medianFirstReviewHours),
      delta: formatDeltaDays(totals.medianFirstReviewHoursDelta),
      invertGood: true,
    },
    {
      key: "reviews",
      label: "Reviews given",
      value: String(totals.reviewsGiven),
      delta: formatCountDelta(totals.reviewsGivenDelta),
      invertGood: false,
    },
  ];

  return (
    <div
      className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}
      data-slot="productivity-kpi-strip"
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="rounded-[var(--radius-card)] border border-border bg-pure-white px-[18px] py-[15px] shadow-[var(--shadow)]"
        >
          <p className="text-[11px] font-medium text-muted">{item.label}</p>
          <p className="mt-[5px] text-[24px] font-semibold leading-[32px] tracking-[-0.7px] text-ink">
            {item.value}
          </p>
          <DeltaLine delta={item.delta} invertGood={item.invertGood} />
        </div>
      ))}
    </div>
  );
}
