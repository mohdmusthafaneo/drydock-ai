import Link from "next/link";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

export function LeadershipCard({
  leadership,
  className,
}: {
  leadership: OverviewDashboardModel["leadership"];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[78px] flex-col gap-3 rounded-xl border border-[#e2ebfa] bg-[#f2f7ff] px-[17px] py-[13px] sm:flex-row sm:items-center sm:gap-3.5",
        className,
      )}
      data-slot="leadership-card"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#e6f0ff] text-[18px] text-[#3b7fd8]"
        aria-hidden
      >
        ♧
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">Waiting on leadership</p>
        <p className="mt-1 text-[11px] text-muted">
          {leadership.count} decision{leadership.count === 1 ? "" : "s"} needed
        </p>
      </div>
      <Link
        href={leadership.href}
        className="inline-flex h-[38px] shrink-0 items-center rounded-lg border border-border bg-pure-white px-[13px] text-[11px] font-medium text-[#344054] hover:bg-hover"
      >
        View details <span className="ml-1">→</span>
      </Link>
    </div>
  );
}
