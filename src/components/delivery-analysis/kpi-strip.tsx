import { cn } from "@/lib/utils";
import type { DeliveryAnalysisKpis } from "@/lib/delivery-analysis/types";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

function DeltaBadge({
  delta,
  suffix = "pts",
  invert = false,
}: {
  delta?: number;
  suffix?: string;
  invert?: boolean;
}) {
  if (delta === undefined) {
    return (
      <span className="text-xs text-muted" title="Trends after two syncs">
        —
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted">
        <Minus className="h-3 w-3" />0 {suffix}
      </span>
    );
  }
  const up = delta > 0;
  const good = invert ? !up : up;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        good ? "text-rust" : "text-warning",
      )}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta)} {suffix}
    </span>
  );
}

const KPI_ITEMS: {
  key: keyof DeliveryAnalysisKpis;
  label: string;
  subtitle: string;
  suffix?: string;
  deltaKey?: keyof DeliveryAnalysisKpis;
  invertDelta?: boolean;
}[] = [
  {
    key: "healthScore",
    label: "Delivery health",
    subtitle: "Composite score at last sync",
    deltaKey: "healthScoreDelta",
    invertDelta: true,
  },
  {
    key: "openWork",
    label: "Open work",
    subtitle: "Incomplete issues in scope",
    deltaKey: "openWorkDelta",
    invertDelta: true,
  },
  {
    key: "blocked",
    label: "Blocked",
    subtitle: "Issues flagged as blocked",
    deltaKey: "blockedDelta",
    invertDelta: true,
  },
  {
    key: "overdue",
    label: "Overdue",
    subtitle: "Past due date, not done",
    deltaKey: "overdueDelta",
    invertDelta: true,
  },
];

export function KpiStrip({ kpis, projectCount }: { kpis: DeliveryAnalysisKpis; projectCount: number }) {
  const scopeLabel =
    projectCount === 1 ? "1 project" : `Across ${projectCount} projects`;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KPI_ITEMS.map((item) => {
        const value = kpis[item.key];
        const delta = item.deltaKey ? kpis[item.deltaKey] : undefined;
        return (
          <Card key={item.key} className="min-w-0">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardDescription>{item.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight">
                {typeof value === "number" ? value.toLocaleString() : value}
                {item.suffix}
              </p>
              <p className="mt-1 text-xs text-secondary">{scopeLabel}</p>
              {item.deltaKey && (
                <p className="mt-1.5 text-secondary">
                  vs prior sync ·{" "}
                  <DeltaBadge delta={delta as number | undefined} invert={item.invertDelta} />
                </p>
              )}
              <p className="mt-1 text-[10px] text-muted">{item.subtitle}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
