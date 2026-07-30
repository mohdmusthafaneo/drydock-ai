"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
};

/**
 * Collapsed-by-default engineering detail disclosure for agent pages.
 */
export function EngineeringDetailSection({
  title,
  description,
  count,
  defaultOpen = false,
  children,
  className,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("space-y-3", className)}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-[24px] border border-border-subtle bg-pure-white px-5 py-4 text-left shadow-[var(--shadow)] transition-colors hover:bg-fog/60">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[17px] leading-snug text-ink">{title}</p>
            {typeof count === "number" ? (
              <span className="inline-flex items-center rounded-full border border-dove/50 bg-fog px-2 py-0.5 text-[11px] font-medium text-ash">
                {count}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="mt-1 text-[13px] text-graphite">{description}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-graphite transition-transform duration-200",
            open && "rotate-180",
          )}
          strokeWidth={1.5}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:animate-out data-[state=open]:animate-in">
        <div className="rounded-[24px] border border-border-subtle bg-pure-white p-5 shadow-[var(--shadow)]">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
