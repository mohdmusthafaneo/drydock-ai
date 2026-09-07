"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CircleX, Flag, TrendingUp, X, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfidenceGauge } from "@/components/overview/charts/gauge";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  flag: Flag,
  "circle-x": CircleX,
  "trend-up": TrendingUp,
  x: X,
  // legacy ids from live loader
  target: Flag,
  ban: CircleX,
  alert: TrendingUp,
  spark: X,
  completion: Flag,
  blocked: CircleX,
  risk: TrendingUp,
  ai: X,
};

const METRIC_ICON_TONE: Record<string, string> = {
  completion: "bg-accent-soft text-accent",
  blocked: "bg-coral-soft text-coral",
  spillover: "bg-accent-soft text-accent",
  "at-risk": "bg-accent-soft text-accent",
  "ai-risk": "bg-blue-soft text-[#3978d4]",
};

const METRIC_BAR: Record<string, string> = {
  completion: "bg-accent",
  blocked: "bg-accent",
  spillover: "bg-accent",
  "at-risk": "bg-accent",
  "ai-risk": "bg-green",
};

export function DeliveryConfidenceCard({
  model,
  className,
}: {
  model: OverviewDashboardModel;
  className?: string;
}) {
  const { deliveryConfidence: dc, teams, teamKey } = model;
  const router = useRouter();
  const searchParams = useSearchParams();

  function onTeamChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("team");
    else params.set("team", value);
    const qs = params.toString();
    router.push(qs ? `/dashboard?${qs}` : "/dashboard");
  }

  return (
    <Card
      className={cn(
        "rounded-[var(--radius-card)] border-border shadow-[var(--shadow)]",
        className,
      )}
      data-slot="delivery-confidence-card"
    >
      <CardHeader className="flex-row items-start justify-between space-y-0 px-[21px] pt-[22px] pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-[16px] font-semibold tracking-[-0.2px] text-ink">
              Delivery confidence
            </CardTitle>
            <InfoTip
              definition="Composite of delivery, code, QA, and governance signals for the active sprint."
              evidenceSource="Jira sprint + code analysis + compliance"
            />
          </div>
          <p className="mt-1 text-[12px] text-muted">
            Based on delivery, code, QA, and governance signals
          </p>
        </div>
        <Select value={teamKey ?? "all"} onValueChange={onTeamChange}>
          <SelectTrigger className="h-[33px] w-auto min-w-[128px] gap-1 border-border text-[12px]">
            <SelectValue placeholder="All teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-[21px] pt-1 pb-[18px]">
        <div className="grid min-h-[245px] gap-7 sm:grid-cols-[1.02fr_0.98fr] sm:items-center">
          <div className="text-center">
            <ConfidenceGauge score={dc.score} band={dc.band} />
            <p className="mt-[22px] text-[15px] font-semibold text-ink">{dc.caption}</p>
          </div>

          <ul className="grid gap-4 border-t border-border pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-[21px]">
            {dc.metrics.map((metric) => {
              const Icon = ICONS[metric.icon] ?? Flag;
              const iconTone = METRIC_ICON_TONE[metric.id] ?? "bg-accent-soft text-accent";
              const bar = METRIC_BAR[metric.id] ?? "bg-accent";
              return (
                <li
                  key={metric.id}
                  className="grid grid-cols-[36px_105px_1fr_46px] items-center gap-2.5"
                >
                  <span
                    className={cn(
                      "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]",
                      iconTone,
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[16px] leading-none font-semibold tabular-nums text-ink">
                      {metric.value}
                    </p>
                    <p className="mt-1 truncate text-[11px] whitespace-nowrap text-muted">
                      {metric.label}
                    </p>
                  </div>
                  <Progress
                    value={Math.min(100, metric.progress)}
                    className="h-2"
                    indicatorClassName={bar}
                  />
                  <small className="text-right text-[10px] text-[#687589]">
                    {metric.annotation ?? ""}
                  </small>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
