import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import type { PrometheusOperationalSignal } from "@/lib/observability-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SEVERITY_VARIANT = {
  info: "default" as const,
  warning: "warning" as const,
  critical: "error" as const,
};

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertTriangle,
};

export function OperationalSignalsPanel({ signals }: { signals: PrometheusOperationalSignal[] }) {
  if (signals.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        No operational signals for the current filters.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {signals.map((signal) => {
        const Icon = SEVERITY_ICON[signal.severity];
        return (
          <div
            key={signal.id}
            className={cn(
              "flex gap-3 rounded-lg border border-border-subtle bg-elevated/50 p-4",
              signal.severity === "critical" && "border-error/30",
              signal.severity === "warning" && "border-warning/30",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                signal.severity === "critical" && "text-error",
                signal.severity === "warning" && "text-warning",
                signal.severity === "info" && "text-chart-blue",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-primary">{signal.label}</p>
                <Badge variant={SEVERITY_VARIANT[signal.severity]}>{signal.severity}</Badge>
                <Badge variant="muted" className="text-[10px]">
                  {signal.category}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-secondary">{signal.value}</p>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted">
        Signals are rule-based at sync time. Recommendations ship in a later phase.
      </p>
    </div>
  );
}

export function OperationalSignalsCard({ signals }: { signals: PrometheusOperationalSignal[] }) {
  if (signals.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Operational signals</CardTitle>
        <CardDescription>Governance signals from Prometheus metrics and alerts</CardDescription>
      </CardHeader>
      <CardContent>
        <OperationalSignalsPanel signals={signals.slice(0, 3)} />
        {signals.length > 3 && (
          <p className="mt-3 text-xs text-muted">
            +{signals.length - 3} more in Signals tab
          </p>
        )}
        <Link href="/recommendations" className="mt-3 inline-block text-xs text-brand hover:underline">
          View recommendations →
        </Link>
      </CardContent>
    </Card>
  );
}
