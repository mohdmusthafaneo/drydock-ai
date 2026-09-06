"use client";

import { useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function OverviewHeader({
  model,
  className,
}: {
  model: OverviewDashboardModel;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
      data-slot="overview-header"
    >
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">
          {greeting}, {model.greetingName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Here&apos;s how your engineering work is tracking.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-pure-white px-2.5 py-1.5 text-xs text-secondary">
          <span className="font-medium text-ink">{model.sprint.name}</span>
          <span className="text-faint">|</span>
          <span>
            {model.sprint.startLabel} – {model.sprint.endLabel}
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={share}>
          <Share2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          {copied ? "Copied" : "Share"}
        </Button>
      </div>
    </div>
  );
}
