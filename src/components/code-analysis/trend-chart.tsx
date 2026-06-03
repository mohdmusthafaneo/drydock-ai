"use client";

import { cn } from "@/lib/utils";
import type { TrendBucket, TrendMetric } from "@/lib/code-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const SERIES = [
  { key: "human_only" as const, label: "Human", color: "var(--text-secondary)" },
  { key: "ai_assisted" as const, label: "Assisted", color: "var(--accent-enterprise)" },
  { key: "ai_generated" as const, label: "Generated", color: "var(--accent-mvp)" },
];

function bucketTotal(bucket: TrendBucket, metric: TrendMetric): number {
  if (metric === "lines") {
    return bucket.human_only + bucket.ai_assisted + bucket.ai_generated;
  }
  if (metric === "commits") return bucket.commits ?? 0;
  return bucket.prs ?? 0;
}

function bucketValue(bucket: TrendBucket, metric: TrendMetric, seriesKey: keyof TrendBucket): number {
  if (metric === "lines") {
    return bucket[seriesKey as "human_only" | "ai_assisted" | "ai_generated"] ?? 0;
  }
  if (metric === "commits") {
    const total = bucket.commits ?? 0;
    const lineTotal = bucket.human_only + bucket.ai_assisted + bucket.ai_generated;
    if (lineTotal === 0) return 0;
    const ratio =
      (bucket[seriesKey as "human_only" | "ai_assisted" | "ai_generated"] ?? 0) / lineTotal;
    return Math.round(total * ratio);
  }
  const total = bucket.prs ?? 0;
  const lineTotal = bucket.human_only + bucket.ai_assisted + bucket.ai_generated;
  if (lineTotal === 0) return 0;
  const ratio =
    (bucket[seriesKey as "human_only" | "ai_assisted" | "ai_generated"] ?? 0) / lineTotal;
  return Math.round(total * ratio);
}

export function TrendChart({
  trend,
  metric,
  onMetricChange,
}: {
  trend: TrendBucket[];
  metric: TrendMetric;
  onMetricChange: (m: TrendMetric) => void;
}) {
  const maxTotal = Math.max(...trend.map((b) => bucketTotal(b, metric)), 1);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Trend over time</CardTitle>
          <CardDescription>Weekly attribution mix</CardDescription>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {(
            [
              { id: "lines" as const, label: "Lines" },
              { id: "commits" as const, label: "Commits" },
              { id: "prs" as const, label: "PRs" },
            ] as const
          ).map((m) => (
            <Button
              key={m.id}
              type="button"
              size="sm"
              variant={metric === m.id ? "secondary" : "ghost"}
              className={cn("h-7 px-2.5 text-xs", metric === m.id && "bg-hover")}
              onClick={() => onMetricChange(m.id)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 sm:gap-3" style={{ minHeight: 160 }}>
          {trend.map((bucket) => {
            const total = bucketTotal(bucket, metric);
            const heightPct = (total / maxTotal) * 100;
            return (
              <div key={bucket.bucket} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className="flex w-full max-w-[48px] flex-col justify-end overflow-hidden rounded-t-md bg-metric-track"
                  style={{ height: 140 }}
                >
                  <div className="flex flex-col-reverse" style={{ height: `${heightPct}%` }}>
                    {SERIES.map((s) => {
                      const val = bucketValue(bucket, metric, s.key);
                      const segPct = total > 0 ? (val / total) * 100 : 0;
                      if (segPct <= 0) return null;
                      return (
                        <div
                          key={s.key}
                          style={{
                            height: `${segPct}%`,
                            backgroundColor: s.color,
                          }}
                          title={`${s.label}: ${val}`}
                        />
                      );
                    })}
                  </div>
                </div>
                <span className="max-w-full truncate text-[10px] text-muted">{bucket.bucket}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-secondary">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
