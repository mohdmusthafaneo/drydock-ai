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
      <div className={cn("space-y-3", className)} data-slot="overview-dashboard">
        <OverviewHeader model={model} />
        <div className="rounded-[var(--radius-card)] border border-border bg-pure-white px-6 py-12 text-center shadow-[var(--shadow)]">
          <p className="text-sm font-medium text-ink">No overview data yet</p>
          <p className="mt-1 text-sm text-muted">
            Connect integrations and sync to populate delivery confidence.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} data-slot="overview-dashboard">
      <OverviewHeader model={model} />

      {/* Row 1: Delivery confidence + Key takeaways — designer 2.15fr / 0.9fr */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2.15fr)_minmax(330px,0.9fr)]">
        <DeliveryConfidenceCard model={model} />
        <KeyTakeawaysCard takeaways={model.keyTakeaways} />
      </div>

      {/* Row 2: Score breakdown — four pillars */}
      <ScoreBreakdownCard pillars={model.pillars} />

      {/* Row 3: Trend + burndown + heatmap — designer 1fr 1fr 1.05fr */}
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.05fr]">
        <DeliveryTrendCard trend={model.deliveryTrend} />
        <SprintBurndownCard burndown={model.burndown} />
        <ActivityHeatmapCard heatmap={model.heatmap} />
      </div>

      {/* Row 4: Attention + Leadership — designer 1.9fr 1fr */}
      <div className="grid gap-3 lg:grid-cols-[1.9fr_1fr]">
        <AttentionBanner attention={model.attention} />
        <LeadershipCard leadership={model.leadership} />
      </div>
    </div>
  );
}
