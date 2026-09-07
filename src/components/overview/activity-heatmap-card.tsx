import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { ActivityHeatmap } from "@/components/overview/charts/heatmap";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

export function ActivityHeatmapCard({
  heatmap,
  className,
}: {
  heatmap: OverviewDashboardModel["heatmap"];
  className?: string;
}) {
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
        <button
          type="button"
          className="inline-flex h-[33px] min-w-[128px] items-center justify-between gap-2 rounded-[9px] border border-border bg-pure-white px-3 text-[12px] text-[#334155]"
        >
          {heatmap.rangeLabel || "Last 2 weeks"}
          <ChevronDown className="h-3.5 w-3.5 text-muted" strokeWidth={1.7} />
        </button>
      </CardHeader>
      <CardContent className="px-[18px] pt-0 pb-3">
        <ActivityHeatmap rows={heatmap.rows} dayLabels={heatmap.dayLabels} />
      </CardContent>
    </Card>
  );
}
