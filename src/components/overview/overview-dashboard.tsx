import { OverviewHeader } from "@/components/overview/overview-header";
import { DeliveryConfidenceCard } from "@/components/overview/delivery-confidence-card";
import { KeyTakeawaysCard } from "@/components/overview/key-takeaways-card";
import { ScoreBreakdownCard } from "@/components/overview/score-breakdown-card";
import { DeliveryTrendCard } from "@/components/overview/delivery-trend-card";
import { SprintBurndownCard } from "@/components/overview/sprint-burndown-card";
import { ActivityHeatmapCard } from "@/components/overview/activity-heatmap-card";
import { AttentionBanner } from "@/components/overview/attention-banner";
import { LeadershipCard } from "@/components/overview/leadership-card";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

export function OverviewDashboard({
  model,
  className,
}: {
  model: OverviewDashboardModel;
  className?: string;
}) {
  if (model.empty) {
    return (
      <div className={cn("space-y-6", className)} data-slot="overview-dashboard">
        <OverviewHeader model={model} />
        <div className="rounded-[12px] border border-border bg-pure-white px-6 py-12 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="text-sm font-medium text-ink">No overview data yet</p>
          <p className="mt-1 text-sm text-muted">
            Connect integrations and sync to populate delivery confidence.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)} data-slot="overview-dashboard">
      <OverviewHeader model={model} />

      {/* Row 1: Delivery confidence (2/3) + Key takeaways (1/3) */}
      <div className="grid gap-5 lg:grid-cols-12">
        <DeliveryConfidenceCard model={model} className="lg:col-span-8" />
        <KeyTakeawaysCard takeaways={model.keyTakeaways} className="lg:col-span-4" />
      </div>

      {/* Row 2: Score breakdown — four pillars */}
      <ScoreBreakdownCard pillars={model.pillars} />

      {/* Row 3: Trend + burndown + heatmap */}
      <div className="grid gap-5 lg:grid-cols-12">
        <DeliveryTrendCard trend={model.deliveryTrend} className="lg:col-span-4" />
        <SprintBurndownCard burndown={model.burndown} className="lg:col-span-4" />
        <ActivityHeatmapCard heatmap={model.heatmap} className="lg:col-span-4" />
      </div>

      {/* Row 4: Attention (2/3) + Leadership (1/3) */}
      <div className="grid gap-5 lg:grid-cols-12">
        {model.attention ? (
          <AttentionBanner attention={model.attention} className="lg:col-span-8" />
        ) : (
          <div className="lg:col-span-8" />
        )}
        <LeadershipCard leadership={model.leadership} className="lg:col-span-4" />
      </div>
    </div>
  );
}
