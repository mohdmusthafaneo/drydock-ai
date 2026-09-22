"use client";

import { AreaTrendChart } from "@/components/overview/charts/area-trend";
import type {
  ProductivityReviewLoadRow,
  ProductivityThroughputPoint,
} from "@/lib/productivity/types";
import { cn } from "@/lib/utils";

export function ProductivityThroughputCard({
  points,
  className,
}: {
  points: ProductivityThroughputPoint[];
  className?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.prsMerged));
  const chartPoints = points.map((p) => ({
    label: p.label,
    // Scale into AreaTrendChart's 0–100 axis
    value: Math.round((p.prsMerged / max) * 90),
  }));
  const target = chartPoints.length
    ? Math.round(
        chartPoints.reduce((s, p) => s + p.value, 0) / chartPoints.length,
      )
    : 50;

  return (
    <div
      className={cn(
        "min-h-[208px] rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]",
        className,
      )}
      data-slot="productivity-throughput-card"
    >
      <div className="flex items-baseline justify-between px-[18px] pt-[15px] pb-1">
        <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-ink">
          Throughput trend
        </h2>
        <span className="text-[11px] text-muted">PRs merged</span>
      </div>
      <div className="px-[12px] pb-3">
        <AreaTrendChart points={chartPoints} target={target} />
      </div>
    </div>
  );
}

export function ProductivityReviewLoadCard({
  rows,
  caption,
  className,
}: {
  rows: ProductivityReviewLoadRow[];
  caption: string | null;
  className?: string;
}) {
  // Mockup shows the top three reviewers.
  const visible = rows.slice(0, 3);
  const max = Math.max(1, ...visible.map((r) => r.reviewsGiven));

  return (
    <div
      className={cn(
        "min-h-[208px] rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]",
        className,
      )}
      data-slot="productivity-review-load-card"
    >
      <div className="px-[18px] pt-[15px] pb-3">
        <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-ink">
          Review load
        </h2>
      </div>
      <div className="space-y-3.5 px-[18px] pb-4">
        {visible.length === 0 ? (
          <p className="text-[12px] text-muted">No reviews this sprint.</p>
        ) : (
          visible.map((row, index) => (
            <div key={row.contributorId} className="flex items-center gap-3">
              <span className="w-[100px] shrink-0 truncate text-[12px] text-secondary">
                {/* Top bar uses full name; others first name — matches mockup. */}
                {index === 0 ? row.displayName : row.shortName}
              </span>
              <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#EDEFF2]">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(row.reviewsGiven / max) * 100}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-[12px] font-medium tabular-nums text-ink">
                {row.reviewsGiven}
              </span>
            </div>
          ))
        )}
        {caption ? (
          <p className="pt-1 text-[11px] leading-snug text-muted">{caption}</p>
        ) : null}
      </div>
    </div>
  );
}
