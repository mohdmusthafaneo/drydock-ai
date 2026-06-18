import { cn } from "@/lib/utils";
import type { ObservabilityAnalysisKpis } from "@/lib/observability-analysis/types";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

function DeltaBadge({
  delta,
  suffix = "",
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
        <Minus className="h-3 w-3" />0{suffix}
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
      {Math.abs(delta)}
      {suffix}
    </span>
  );
}

const KPI_ITEMS: {
  key: keyof ObservabilityAnalysisKpis;
  label: string;
  subtitle: string;
  format: (v: number) => string;
  deltaKey?: keyof ObservabilityAnalysisKpis;
  invertDelta?: boolean;
  deltaSuffix?: string;
}[] = [
  {
    key: "healthScore",
    label: "Reliability health",
    subtitle: "Composite score at last sync",
    format: (v) => String(v),
    deltaKey: "healthScoreDelta",
    invertDelta: false,
    deltaSuffix: " pts",
  },
  {
    key: "errorRate",
    label: "HTTP error rate",
    subtitle: "5xx share over 5m window",
    format: (v) => `${v}%`,
    deltaKey: "errorRateDelta",
    invertDelta: true,
    deltaSuffix: "%",
  },
  {
    key: "p95LatencyMs",
    label: "P95 latency",
    subtitle: "95th percentile request duration",
    format: (v) => `${v}ms`,
    deltaKey: "p95LatencyDelta",
    invertDelta: true,
    deltaSuffix: "ms",
  },
  {
    key: "openAlerts",
    label: "Open alerts",
    subtitle: "Firing Alertmanager alerts in scope",
    format: (v) => String(v),
    deltaKey: "openAlertsDelta",
    invertDelta: true,
  },
];

export function KpiStrip({
  kpis,
  serviceCount,
  environmentLabel,
}: {
  kpis: ObservabilityAnalysisKpis;
  serviceCount: number;
  environmentLabel: string;
}) {
  const scopeLabel =
    serviceCount === 1
      ? `1 service · ${environmentLabel}`
      : `Across ${serviceCount} services · ${environmentLabel}`;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KPI_ITEMS.map((item) => {
        const raw = kpis[item.key];
        const value = typeof raw === "number" ? raw : 0;
        const delta = item.deltaKey ? kpis[item.deltaKey] : undefined;
        return (
          <Card key={item.key} className="min-w-0">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardDescription>{item.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight">{item.format(value)}</p>
              <p className="mt-1 text-xs text-secondary">{scopeLabel}</p>
              {item.deltaKey && (
                <p className="mt-1.5 text-secondary">
                  vs prior sync ·{" "}
                  <DeltaBadge
                    delta={delta as number | undefined}
                    invert={item.invertDelta}
                    suffix={item.deltaSuffix}
                  />
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
