import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ObservabilityServiceRow } from "@/lib/observability-analysis/types";

export function ServiceBreakdown({
  items,
  onSelectService,
  selectedService,
}: {
  items: ObservabilityServiceRow[];
  onSelectService?: (id: string) => void;
  selectedService?: string | null;
}) {
  const maxHealth = 100;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">By service</CardTitle>
        <CardDescription>Health score and error rate · click to filter</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted">No data for selected filters.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectService?.(item.id)}
              className={cn(
                "w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover",
                selectedService === item.id && "bg-enterprise-muted/40 ring-1 ring-enterprise/30",
              )}
            >
              <div className="mb-1 flex justify-between gap-2 text-xs">
                <span className="truncate font-medium text-primary">
                  {item.label}
                  <span className="ml-1 font-normal text-muted">· {item.environment}</span>
                </span>
                <span className="shrink-0 tabular-nums text-secondary">
                  {item.healthScore} health · {item.errorRate}% err
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-metric-track">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${(item.healthScore / maxHealth) * 100}%`, opacity: 0.5 }}
                />
                <div
                  className="-mt-2 h-full rounded-full bg-enterprise transition-all"
                  style={{ width: `${Math.min(100, item.errorRate * 20)}%` }}
                />
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
