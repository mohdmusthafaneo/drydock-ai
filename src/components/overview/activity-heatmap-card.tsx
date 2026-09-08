"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActivityHeatmap } from "@/components/overview/charts/heatmap";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import {
  ACTIVITY_HEATMAP_RANGES,
  chartRangeFromLabel,
  chartRangeOption,
  takeLastPoints,
} from "@/lib/overview/chart-ranges";
import { cn } from "@/lib/utils";

const DEFAULT_HEATMAP_RANGE = ACTIVITY_HEATMAP_RANGES[1]!;

export function ActivityHeatmapCard({
  heatmap,
  className,
}: {
  heatmap: OverviewDashboardModel["heatmap"];
  className?: string;
}) {
  const [range, setRange] = useState(() =>
    chartRangeFromLabel(
      heatmap.rangeLabel,
      ACTIVITY_HEATMAP_RANGES,
      DEFAULT_HEATMAP_RANGE.value,
    ),
  );

  const option = chartRangeOption(range, ACTIVITY_HEATMAP_RANGES, DEFAULT_HEATMAP_RANGE);
  const dayLabels = takeLastPoints(heatmap.dayLabels, option.takeLast);
  const rows = heatmap.rows.map((row) => ({
    ...row,
    cells: takeLastPoints(row.cells, option.takeLast),
  }));

  return (
    <Card
      className={cn(
        "min-h-[208px] rounded-[var(--radius-card)] border-border shadow-[var(--shadow)]",
        className,
      )}
      data-slot="activity-heatmap-card"
    >
      <CardHeader className="mb-2 flex-row items-center justify-between space-y-0 px-[18px] pt-[15px] pb-0">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-[16px] font-semibold tracking-[-0.2px]">
            Activity heatmap
          </CardTitle>
          <InfoTip
            definition="Daily intensity across commits, PRs, deploys, and incidents. Darker cells mean more activity."
            evidenceSource="GitHub + CI + incidents"
          />
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-[33px] w-auto min-w-[128px] gap-1 border-border text-[12px] text-[#334155]">
            <SelectValue placeholder={DEFAULT_HEATMAP_RANGE.label} />
          </SelectTrigger>
          <SelectContent>
            {ACTIVITY_HEATMAP_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-[18px] pt-0 pb-3">
        <ActivityHeatmap rows={rows} dayLabels={dayLabels} />
      </CardContent>
    </Card>
  );
}
