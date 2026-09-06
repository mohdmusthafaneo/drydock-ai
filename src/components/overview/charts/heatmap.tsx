"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const HEAT_COLORS = [
  "var(--heatmap-1)",
  "var(--heatmap-2)",
  "var(--heatmap-3)",
  "var(--heatmap-4)",
  "var(--heatmap-5)",
] as const;

function heatColor(value: number): string {
  const step = Math.max(0, Math.min(4, Math.round(value)));
  return HEAT_COLORS[step]!;
}

export function ActivityHeatmap({
  rows,
  dayLabels,
  className,
}: {
  rows: { label: string; cells: number[] }[];
  dayLabels: string[];
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("space-y-2", className)} data-slot="heatmap">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `72px repeat(${dayLabels.length}, minmax(0, 1fr))`,
          }}
        >
          <div />
          {dayLabels.map((d, i) => (
            <div
              key={`${d}-${i}`}
              className="text-center text-[10px] text-faint"
            >
              {d}
            </div>
          ))}
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <div className="flex items-center text-[11px] text-muted">{row.label}</div>
              {row.cells.map((cell, i) => (
                <Tooltip key={`${row.label}-${i}`}>
                  <TooltipTrigger asChild>
                    <div
                      className="aspect-square min-h-[14px] rounded-[3px]"
                      style={{ backgroundColor: heatColor(cell) }}
                      aria-label={`${row.label} day ${i + 1}: ${cell}`}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {row.label}: {cell}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
