import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { BurndownChart } from "@/components/overview/charts/burndown";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

export function SprintBurndownCard({
  burndown,
  className,
}: {
  burndown: OverviewDashboardModel["burndown"];
  className?: string;
}) {
  return (
    <Card className={cn("rounded-[12px]", className)} data-slot="sprint-burndown-card">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-[15px] font-semibold">Sprint burndown</CardTitle>
          <InfoTip
            definition="Ideal remaining work (dashed) versus actual remaining. Blue dots mark actual observations."
            evidenceSource="Jira sprint issues"
          />
        </div>
        <span className="text-xs text-muted">
          {burndown.completed} of {burndown.total} done
        </span>
      </CardHeader>
      <CardContent className="p-5 pt-2">
        <BurndownChart ideal={burndown.ideal} actual={burndown.actual} />
      </CardContent>
    </Card>
  );
}
