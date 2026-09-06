"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
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
  target: Target,
  ban: Ban,
  alert: AlertTriangle,
  spark: Sparkles,
  completion: Target,
  blocked: Ban,
  risk: AlertTriangle,
  ai: Sparkles,
};

const METRIC_BAR: Record<string, string> = {
  completion: "bg-accent",
  blocked: "bg-error",
  "at-risk": "bg-accent",
  "ai-risk": "bg-info",
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
        "rounded-[12px] border-border shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        className,
      )}
      data-slot="delivery-confidence-card"
    >
      <CardHeader className="flex-row items-start justify-between space-y-0 p-5 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-[15px] font-semibold text-ink">
              Delivery confidence
            </CardTitle>
            <InfoTip
              definition="Composite of delivery, code, QA, and governance signals for the active sprint."
              evidenceSource="Jira sprint + code analysis + compliance"
            />
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Based on delivery, code, QA, and governance signals
          </p>
        </div>
        <Select value={teamKey ?? "all"} onValueChange={onTeamChange}>
          <SelectTrigger className="h-8 w-auto min-w-[7.5rem] gap-1 border-border text-xs">
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
      <CardContent className="p-5 pt-1">
        <div className="grid gap-6 sm:grid-cols-[minmax(180px,1fr)_1.2fr] sm:items-center">
          <div className="text-center">
            <ConfidenceGauge score={dc.score} band={dc.band} />
            <p className="mt-2 text-sm text-secondary">{dc.caption}</p>
          </div>

          <ul className="space-y-3.5">
            {dc.metrics.map((metric) => {
              const Icon = ICONS[metric.icon] ?? Target;
              const bar = METRIC_BAR[metric.id] ?? "bg-info";
              return (
                <li key={metric.id} className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <Icon className="h-4 w-4" strokeWidth={1.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[13px] text-secondary">{metric.label}</p>
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                          {metric.value}
                          {metric.annotation ? (
                            <span className="ml-1.5 text-xs font-normal text-faint">
                              {metric.annotation}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <Progress
                        value={Math.min(100, metric.progress)}
                        className="mt-1.5 h-1.5"
                        indicatorClassName={bar}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
