import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Progress } from "@/components/ui/progress";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[11px] text-muted">—</span>;
  }
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        flat
          ? "bg-elevated text-muted"
          : up
            ? "bg-success-soft text-success"
            : "bg-error-soft text-error",
      )}
    >
      {up ? "↑" : flat ? "" : "↓"}
      {up ? "+" : ""}
      {delta}
    </span>
  );
}

const PILLAR_BAR: Record<string, string> = {
  delivery: "bg-accent",
  code: "bg-info",
  qa: "bg-warning",
  compliance: "bg-success",
};

export function ScoreBreakdownCard({
  pillars,
  className,
}: {
  pillars: OverviewDashboardModel["pillars"];
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-[12px] border-border shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        className,
      )}
      data-slot="score-breakdown-card"
    >
      <CardHeader className="flex-row items-start justify-between space-y-0 p-5 pb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-[15px] font-semibold text-ink">Score breakdown</CardTitle>
            <InfoTip
              definition="The four pillars of engineering productivity. Deltas are week-over-week when snapshots exist."
              evidenceSource="Delivery, code, QA, and compliance signals"
            />
          </div>
          <p className="mt-0.5 text-xs text-muted">The 4 pillars of engineering productivity</p>
        </div>
        <Link
          href="/delivery-analysis"
          className="rounded-lg border border-border bg-pure-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-hover"
        >
          View details
        </Link>
      </CardHeader>
      <CardContent className="p-5 pt-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {pillars.map((pillar) => (
            <div
              key={pillar.id}
              className="rounded-[10px] border border-border bg-pure-white p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-secondary">{pillar.name}</p>
                <DeltaChip delta={pillar.delta} />
              </div>
              <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-ink">
                {pillar.score}
              </p>
              <Progress
                value={pillar.progress}
                className="mt-3"
                indicatorClassName={PILLAR_BAR[pillar.id] ?? "bg-info"}
              />
              <p className="mt-2 text-[11px] leading-snug text-muted">{pillar.footnote}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
