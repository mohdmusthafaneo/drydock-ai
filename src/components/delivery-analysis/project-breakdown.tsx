import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DeliveryAnalysisProjectRow } from "@/lib/delivery-analysis/types";

export function ProjectBreakdown({
  items,
  onSelectProject,
  selectedProject,
}: {
  items: DeliveryAnalysisProjectRow[];
  onSelectProject?: (key: string) => void;
  selectedProject?: string | null;
}) {
  const maxOpen = Math.max(...items.map((i) => i.openIssues), 1);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">By project</CardTitle>
        <CardDescription>Health score and open work · click to filter</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted">No data for selected filters.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectProject?.(item.key)}
              className={cn(
                "w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover",
                selectedProject === item.key && "bg-sky-wash/60 ring-1 ring-chart-blue/30",
              )}
            >
              <div className="mb-1 flex justify-between gap-2 text-xs">
                <span className="truncate font-medium text-primary">
                  {item.key} · {item.name}
                </span>
                <span className="shrink-0 tabular-nums text-secondary">
                  {item.healthScore} health · {item.openIssues} open
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-metric-track">
                <div
                  className="h-full rounded-full bg-chart-blue/50 transition-all"
                  style={{ width: `${(item.healthScore / 100) * 100}%`, opacity: 0.5 }}
                />
                <div
                  className="-mt-2 h-full rounded-full bg-chart-blue transition-all"
                  style={{ width: `${(item.openIssues / maxOpen) * 100}%` }}
                />
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
