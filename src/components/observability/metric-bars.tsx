import { cn } from "@/lib/utils";

type Metric = {
  metricKey: string;
  value: number;
  unit: string | null;
  source: string;
};

const LABELS: Record<string, string> = {
  http_error_rate: "HTTP error rate",
  p95_latency_ms: "P95 latency",
  cpu_utilization: "CPU utilization",
  memory_utilization: "Memory",
  deployment_success_rate: "Deploy success",
  active_incidents: "Active incidents",
};

export function MetricBars({ metrics }: { metrics: Metric[] }) {
  const latest = new Map<string, Metric>();
  for (const m of metrics) {
    if (!latest.has(m.metricKey)) latest.set(m.metricKey, m);
  }

  const items = [...latest.values()];

  if (items.length === 0) {
    return <p className="text-sm text-muted">No metrics ingested yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((m) => {
        const max = m.metricKey.includes("latency") ? 400 : m.metricKey.includes("rate") ? 5 : 100;
        const pct = Math.min(100, (m.value / max) * 100);
        const warn =
          (m.metricKey === "http_error_rate" && m.value > 0.8) ||
          (m.metricKey === "p95_latency_ms" && m.value > 200);
        return (
          <div key={m.metricKey}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-secondary">{LABELS[m.metricKey] ?? m.metricKey}</span>
              <span className={warn ? "text-warning" : "text-primary"}>
                {m.value}
                {m.unit}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#131A2A]">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  warn ? "bg-warning" : "bg-enterprise",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-0.5 text-[10px] text-muted">via {m.source}</p>
          </div>
        );
      })}
    </div>
  );
}
