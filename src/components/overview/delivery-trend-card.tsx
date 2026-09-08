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
      </CardHeader>
      <CardContent className="px-[18px] pt-0 pb-3">
        <AreaTrendChart points={trend.points} target={trend.target} />
      </CardContent>
    </Card>
  );
}
