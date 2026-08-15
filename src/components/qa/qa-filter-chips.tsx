"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type QaFilter = "all" | "bugs" | "issues";

type Props = {
  defaultFilter?: QaFilter;
  bugCount: number;
  issueCount: number;
  onFilterChange?: (filter: QaFilter) => void;
};

const TAXONOMY_TEXT =
  "Bug = Jira issue with issuetype Bug. Issue = any other Jira issuetype (Story, Task, Epic, etc.) — including Bug subtasks classified as stories.";

export function QaFilterChips({ defaultFilter = "all", bugCount, issueCount, onFilterChange }: Props) {
  const [active, setActive] = useState<QaFilter>(defaultFilter);

  function select(f: QaFilter) {
    setActive(f);
    onFilterChange?.(f);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-full border border-border-subtle bg-fog/40 p-1">
        {(["all", "bugs", "issues"] as const).map((f) => (
          <button
            key={f}
            onClick={() => select(f)}
            className={cn(
              "rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
              active === f
                ? "bg-pure-white text-ink shadow-sm"
                : "text-graphite hover:text-ink",
            )}
          >
            {f === "all" ? "All" : f === "bugs" ? "Bugs" : "Issues"}
            <span className="ml-1.5 text-[11px] text-muted">
              {f === "all" ? bugCount + issueCount : f === "bugs" ? bugCount : issueCount}
            </span>
          </button>
        ))}
      </div>

      <Tooltip>
        <TooltipTrigger className="flex items-center gap-1 text-[12px] text-graphite">
          <Info className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="hidden sm:inline">taxonomy</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-[12px] leading-relaxed">
          {TAXONOMY_TEXT}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
