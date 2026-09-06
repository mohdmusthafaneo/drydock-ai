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
    <Card className={cn("rounded-[12px]", className)} data-slot="activity-heatmap-card">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-[15px] font-semibold">Activity</CardTitle>
          <InfoTip
            definition="Daily intensity across commits, PRs, deploys, and incidents. Darker cells mean more activity."
            evidenceSource="GitHub + CI + incidents"
          />
        </div>
        <span className="text-xs text-muted">{heatmap.rangeLabel}</span>
      </CardHeader>
      <CardContent className="p-5 pt-2">
        <ActivityHeatmap rows={heatmap.rows} dayLabels={heatmap.dayLabels} />
      </CardContent>
    </Card>
  );
}
