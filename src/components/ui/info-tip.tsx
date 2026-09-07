"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function InfoTip({
  definition,
  evidenceSource,
  className,
}: {
  definition: string;
  evidenceSource?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-slot="info-tip"
            className={cn(
              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-faint hover:text-muted",
              className,
            )}
            aria-label="More information"
            aria-expanded={open}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-1.5 bg-ink px-3 py-2 text-left">
          <p className="text-xs leading-relaxed text-pure-white">{definition}</p>
          {evidenceSource ? (
            <p className="text-[11px] leading-snug text-dove">
              Evidence: {evidenceSource}
            </p>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
