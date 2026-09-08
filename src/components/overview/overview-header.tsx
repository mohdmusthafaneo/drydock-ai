"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Toast } from "@/components/ui/toast";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

export function OverviewHeader({
  model,
  className,
}: {
  model: OverviewDashboardModel;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setShareError(false);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      setShareError(true);
    }
  }

  return (
    <div
      className={cn(
        "mb-[18px] flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
      data-slot="overview-header"
    >
      <div className="min-w-0">
        <h1 className="text-[28px] leading-[1.12] font-bold tracking-[-0.75px] text-ink">
          {model.greeting}, {model.greetingName}
        </h1>
        <p className="mt-[5px] text-[15px] text-muted">
          Here&apos;s how your engineering work is tracking.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={share}
          className="inline-flex h-[42px] items-center gap-2 rounded-[9px] border border-border bg-pure-white px-3.5 text-[14px] font-semibold text-[#182230] hover:bg-hover"
        >
          <Share2 className="h-[17px] w-[17px]" strokeWidth={1.7} />
          {copied ? "Copied" : "Share"}
        </button>
      </div>
      <Toast
        message="Clipboard access denied — copy the URL from the address bar."
        visible={shareError}
        onDismiss={() => setShareError(false)}
      />
    </div>
  );
}
