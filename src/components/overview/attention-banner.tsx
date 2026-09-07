"use client";

import { OverviewLink } from "@/components/overview/overview-link";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

const RESTING_ATTENTION = {
  count: 0,
  message: "Nothing needs attention in the current evidence set.",
  href: "/approvals",
} as const;

export function AttentionBanner({
  attention,
  className,
}: {
  attention: OverviewDashboardModel["attention"] | null;
  className?: string;
}) {
  const data = attention ?? RESTING_ATTENTION;
  const resting = !attention || attention.count === 0;

  const body = (
    <>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-pure-white text-[18px] text-[#9b4829]"
        aria-hidden
      >
        ≡
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">
          {resting
            ? "All clear"
            : `${data.count} ${data.count === 1 ? "item needs" : "items need"} attention`}
        </p>
        <p className="mt-1 text-[11px] text-[#8a5c49]">{data.message}</p>
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "flex min-h-[78px] flex-col gap-3 rounded-xl border border-[#ffe0d1] bg-[#fff0e8] px-[17px] py-[13px] sm:flex-row sm:items-center sm:gap-3.5",
        className,
      )}
      data-slot="attention-banner"
    >
      {!resting ? (
        <OverviewLink
          href={data.href}
          className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-3.5 rounded-[9px] outline-offset-2 hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {body}
        </OverviewLink>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-3.5">
          {body}
        </div>
      )}
      {!resting ? (
        <OverviewLink
          href={data.href}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-[9px] bg-brown-button px-4 text-[12px] font-semibold text-white hover:opacity-90"
        >
          Review now <span className="ml-2 text-[15px]">→</span>
        </OverviewLink>
      ) : null}
    </div>
  );
}
