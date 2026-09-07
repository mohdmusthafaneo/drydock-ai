"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Share2 } from "lucide-react";
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
        "mb-[6px] flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
      data-slot="overview-header"
    >
      <div className="min-w-0">
        <h1 className="text-[28px] leading-[1.12] font-bold tracking-[-0.75px] text-ink">
          {greeting}, {model.greetingName}
        </h1>
        <p className="mt-[5px] text-[15px] text-muted">
          Here&apos;s how your engineering work is tracking.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <button
          type="button"
          className="inline-flex h-[42px] min-w-[245px] items-center gap-[13px] rounded-[9px] border border-border bg-pure-white px-[13px] text-[12px] text-[#334155]"
        >
          <strong className="text-[13px] font-semibold text-[#4a2b1e]">
            {model.sprint.name}
          </strong>
          <span className="border-l border-border pl-[13px] text-[#7b8798]">
            {model.sprint.startLabel} – {model.sprint.endLabel}
          </span>
          <ChevronDown className="ml-auto h-[15px] w-[15px] text-muted" strokeWidth={1.7} />
        </button>
        <button
          type="button"
          onClick={share}
          className="inline-flex h-[42px] items-center gap-2 rounded-[9px] border border-border bg-pure-white px-3.5 text-[14px] font-semibold text-[#182230] hover:bg-hover"
        >
          <Share2 className="h-[17px] w-[17px]" strokeWidth={1.7} />
          {copied ? "Copied" : "Share"}
        </button>
      </div>
    </div>
  );
}
