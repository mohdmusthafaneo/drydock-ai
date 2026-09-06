import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { AreaTrendChart } from "@/components/overview/charts/area-trend";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

export function DeliveryTrendCard({
  trend,
  className,
}: {
  trend: OverviewDashboardModel["deliveryTrend"];
  className?: string;
}) {
  return (
    <Card className={cn("rounded-[12px]", className)} data-slot="delivery-trend-card">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-[15px] font-semibold">Delivery trend</CardTitle>
          <InfoTip
            definition="Weekly delivery confidence over the recent window, with a dashed target line."
            evidenceSource="Sprint rollups"
          />
        </div>
        <span className="text-xs text-muted">{trend.rangeLabel}</span>
      </CardHeader>
      <CardContent className="p-5 pt-2">
        <AreaTrendChart points={trend.points} target={trend.target} />
      </CardContent>
    </Card>
  );
}
