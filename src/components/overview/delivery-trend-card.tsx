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
import { AreaTrendChart } from "@/components/overview/charts/area-trend";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import {
  DELIVERY_TREND_RANGES,
  chartRangeFromLabel,
  chartRangeOption,
  takeLastPoints,
} from "@/lib/overview/chart-ranges";
import { cn } from "@/lib/utils";

const DEFAULT_TREND_RANGE = DELIVERY_TREND_RANGES[2]!;

export function DeliveryTrendCard({
  trend,
  className,
}: {
  trend: OverviewDashboardModel["deliveryTrend"];
  className?: string;
}) {
  const [range, setRange] = useState(() =>
    chartRangeFromLabel(trend.rangeLabel, DELIVERY_TREND_RANGES, DEFAULT_TREND_RANGE.value),
  );

  const option = chartRangeOption(range, DELIVERY_TREND_RANGES, DEFAULT_TREND_RANGE);
  const points = takeLastPoints(trend.points, option.takeLast);

  return (
    <Card
      className={cn(
        "min-h-[208px] rounded-[var(--radius-card)] border-border shadow-[var(--shadow)]",
        className,
      )}
      data-slot="delivery-trend-card"
    >
      <CardHeader className="mb-2 flex-row items-center justify-between space-y-0 px-[18px] pt-[15px] pb-0">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-[16px] font-semibold tracking-[-0.2px]">
            Delivery trend
          </CardTitle>
          <InfoTip
            definition="Weekly delivery confidence over the recent window, with a dashed target line."
            evidenceSource="Sprint rollups"
          />
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-[33px] w-auto min-w-[128px] gap-1 border-border text-[12px] text-[#334155]">
            <SelectValue placeholder={DEFAULT_TREND_RANGE.label} />
          </SelectTrigger>
          <SelectContent>
            {DELIVERY_TREND_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-[18px] pt-0 pb-3">
        <AreaTrendChart points={points} target={trend.target} />
      </CardContent>
    </Card>
  );
}
