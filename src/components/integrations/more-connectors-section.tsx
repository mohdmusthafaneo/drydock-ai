"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MoreConnectorsSection({
  children,
  count,
}: {
  children: React.ReactNode;
  count: number;
}) {
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-6">
        <div>
          <h2 className="text-sm font-semibold text-primary">More connectors</h2>
          <p className="text-xs text-muted">
            Optional integrations for CI and notifications ({count})
          </p>
        </div>
        <CollapsibleTrigger asChild>
          <Button type="button" size="sm" variant="secondary">
            {open ? "Hide" : "Show"}
            <ChevronDown
              className={cn("ml-1 h-3.5 w-3.5 transition-transform", open && "rotate-180")}
            />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
