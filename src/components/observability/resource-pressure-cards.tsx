import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ObservabilityServiceRow } from "@/lib/observability-analysis/types";

function PressureBar({ value, label }: { value: number; label: string }) {
  const warning = value > 85;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-secondary">{label}</span>
        <span className={cn("tabular-nums font-medium", warning && "text-warning")}>
          {value}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-metric-track">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            warning ? "bg-warning" : "bg-brand",
          )}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

export function ResourcePressureCards({ services }: { services: ObservabilityServiceRow[] }) {
  const top = [...services]
    .sort((a, b) => Math.max(b.cpuUtilizationPct, b.memoryUtilizationPct) - Math.max(a.cpuUtilizationPct, a.memoryUtilizationPct))
    .slice(0, 4);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Resource pressure</CardTitle>
        <CardDescription>CPU and memory utilization · warning above 85%</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {top.length === 0 ? (
          <p className="text-sm text-muted">No services in scope.</p>
        ) : (
          top.map((svc) => (
            <div
              key={svc.id}
              className={cn(
                "rounded-lg border border-border-subtle p-3",
                (svc.cpuUtilizationPct > 85 || svc.memoryUtilizationPct > 85) &&
                  "border-warning/30 bg-warning/5",
              )}
            >
              <p className="mb-2 text-sm font-medium text-primary">
                {svc.label}
                <span className="ml-1 text-xs font-normal text-muted">· {svc.environment}</span>
              </p>
              <div className="space-y-2">
                <PressureBar value={svc.cpuUtilizationPct} label="CPU" />
                <PressureBar value={svc.memoryUtilizationPct} label="Memory" />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
