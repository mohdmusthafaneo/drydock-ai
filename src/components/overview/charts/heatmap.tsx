"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const HEAT_COLORS = [
  "var(--heatmap-0)",
  "var(--heatmap-1)",
  "var(--heatmap-2)",
  "var(--heatmap-3)",
  "var(--heatmap-4)",
] as const;

function heatColor(value: number): string {
  const step = Math.max(0, Math.min(4, Math.round(value)));
  return HEAT_COLORS[step]!;
}

function pickDateLabels(dayLabels: string[], cellCount: number): string[] {
  if (dayLabels.length <= 6) return dayLabels;
  if (dayLabels.length === cellCount) {
    const indexes = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) =>
      Math.round(t * (dayLabels.length - 1)),
    );
    return indexes.map((i) => dayLabels[i]!);
  }
  return dayLabels.slice(0, 6);
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
  const colCount = Math.max(1, ...rows.map((r) => r.cells.length));
  const dateLabels = pickDateLabels(dayLabels, colCount);

  if (rows.length === 0) {
    return (
      <div
        className={cn("flex h-[120px] items-center justify-center text-[12px] text-muted", className)}
        data-slot="heatmap"
      >
        No activity data yet
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("mt-3", className)} data-slot="heatmap">
        <div className="grid grid-cols-[80px_1fr] gap-[9px]">
          <div
            className="grid h-[100px] items-center text-[9px] text-[#607086]"
            style={{ gridTemplateRows: `repeat(${rows.length}, 1fr)` }}
          >
            {rows.map((row) => (
              <span key={row.label}>{row.label}</span>
            ))}
          </div>
          <div className="grid gap-[7px]">
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid gap-[5px]"
                style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
              >
                {Array.from({ length: colCount }, (_, i) => {
                  const cell = row.cells[i] ?? 0;
                  return (
                    <Tooltip key={`${row.label}-${i}`}>
                      <TooltipTrigger asChild>
                        <i
                          className="block h-4 rounded-[2px]"
                          style={{ backgroundColor: heatColor(cell) }}
                          aria-label={`${row.label} day ${i + 1}: ${cell}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        {row.label}: {cell}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-[3px] ml-20 flex justify-between text-[9px] text-[#718096]">
          {dateLabels.map((d, i) => (
            <span key={`${d}-${i}`}>{d}</span>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
