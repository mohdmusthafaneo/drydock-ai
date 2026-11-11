import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CursorAiTool } from "@/lib/cursor-api/types";
import { cn } from "@/lib/utils";
import { Bot, Cloud, Sparkles, SquarePen } from "lucide-react";

const CATEGORY_ICON = {
  editor: SquarePen,
  agent: Bot,
  review: Sparkles,
  cloud: Cloud,
} as const;

const CATEGORY_TONE = {
  editor: "bg-[#FFF0E8] text-[#C45A1A]",
  agent: "bg-[#E6F7F1] text-[#0F766E]",
  review: "bg-[#EEE8FF] text-[#5B3CC4]",
  cloud: "bg-[#E8F1FF] text-[#1D4ED8]",
} as const;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString();
}

export function AiToolsPanel({ tools }: { tools: CursorAiTool[] }) {
  return (
    <Card data-slot="ai-tools-panel">
      <CardHeader>
        <CardTitle>AI tools in use</CardTitle>
        <CardDescription>
          Cursor surfaces active this sprint — token share of total spend
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {tools.length === 0 ? (
          <p className="text-[13px] text-muted">No tool activity in this window</p>
        ) : (
          tools.map((tool) => {
            const Icon = CATEGORY_ICON[tool.category];
            return (
              <div
                key={tool.id}
                className="flex items-start gap-3 rounded-[9px] border border-border-soft px-3 py-2.5"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
                    CATEGORY_TONE[tool.category],
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {tool.name}
                    </p>
                    <p className="shrink-0 text-[12px] font-medium tabular-nums text-ink">
                      {formatTokens(tool.tokens)} · ${tool.spendUsd.toFixed(2)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-faint">{tool.hint}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(tool.sharePct, 2)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {tool.sharePct}% of tokens · {tool.activeUnits.toLocaleString()}{" "}
                    units
                  </p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
