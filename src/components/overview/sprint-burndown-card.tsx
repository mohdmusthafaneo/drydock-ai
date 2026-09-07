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
    <Card
      className={cn(
        "min-h-[208px] rounded-[var(--radius-card)] border-border shadow-[var(--shadow)]",
        className,
      )}
      data-slot="sprint-burndown-card"
    >
      <CardHeader className="mb-2 flex-row items-center justify-between space-y-0 px-[18px] pt-[15px] pb-0">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-[16px] font-semibold tracking-[-0.2px]">
            Sprint burndown
          </CardTitle>
          <InfoTip
            definition="Ideal remaining work (dashed) versus actual remaining. Blue dots mark actual observations."
            evidenceSource="Jira sprint issues"
          />
        </div>
        <div className="flex items-center gap-[13px] text-[10px] text-muted">
          <span className="inline-flex items-center gap-1">
            <i
              className="inline-block h-0.5 w-[18px] align-[3px]"
              style={{
                background:
                  "repeating-linear-gradient(to right, #aab3bf 0 4px, transparent 4px 7px)",
              }}
            />
            Ideal
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-0.5 w-[18px] bg-blue align-[3px]" />
            Actual
          </span>
          <strong className="ml-[5px] text-[11px] font-semibold text-[#344054]">
            {burndown.completed} of {burndown.total}
          </strong>
        </div>
      </CardHeader>
      <CardContent className="px-[18px] pt-0 pb-3">
        <BurndownChart ideal={burndown.ideal} actual={burndown.actual} />
      </CardContent>
    </Card>
  );
}
