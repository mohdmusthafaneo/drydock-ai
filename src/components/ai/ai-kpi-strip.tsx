import type { CursorAiKpis } from "@/lib/cursor-api/types";
import { cn } from "@/lib/utils";

function formatPct(value: number | null): string {
  if (value == null) return "—";
  return `${value}%`;
}

function formatCount(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString();
}

type KpiItem = {
  key: string;
  label: string;
  value: string;
  hint: string;
};

export function AiKpiStrip({
  kpis,
  className,
}: {
  kpis: CursorAiKpis;
  className?: string;
}) {
  const items: KpiItem[] = [
    {
      key: "dau",
      label: "Latest DAU",
      value: formatCount(kpis.latestDau),
      hint: kpis.latestDauDate
        ? `As of ${kpis.latestDauDate}`
        : "No DAU samples yet",
    },
    {
      key: "agent",
      label: "Agent accept rate",
      value: formatPct(kpis.agentAcceptRatePct),
      hint: `${kpis.agentAccepted.toLocaleString()} / ${kpis.agentSuggested.toLocaleString()} diffs`,
    },
    {
      key: "tabs",
      label: "Tab accept rate",
      value: formatPct(kpis.tabAcceptRatePct),
      hint: `${kpis.tabAccepts.toLocaleString()} / ${kpis.tabSuggestions.toLocaleString()} suggestions`,
    },
    {
      key: "commits",
      label: "Sprint commits tracked",
      value: formatCount(kpis.aiCommitsTracked),
      hint: "Merged PRs in this sprint window",
    },
  ];

  return (
    <div
      className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}
      data-slot="ai-kpi-strip"
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="rounded-[var(--radius-card)] border border-border bg-pure-white px-[18px] py-[15px] shadow-[var(--shadow)]"
        >
          <p className="text-[11px] font-medium text-muted">{item.label}</p>
          <p className="mt-[5px] text-[24px] font-semibold leading-[32px] tracking-[-0.7px] text-ink">
            {item.value}
          </p>
          <p className="mt-1 text-[11px] leading-[15px] text-faint">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}
