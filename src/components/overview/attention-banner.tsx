import Link from "next/link";
import { ArrowRight, ListTodo } from "lucide-react";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

export function AttentionBanner({
  attention,
  className,
}: {
  attention: NonNullable<OverviewDashboardModel["attention"]>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[12px] border border-accent-ring/60 bg-accent-soft px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      data-slot="attention-banner"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pure-white text-accent shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <ListTodo className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {attention.count} {attention.count === 1 ? "item needs" : "items need"} attention
          </p>
          <p className="mt-0.5 text-sm text-secondary">{attention.message}</p>
        </div>
      </div>
      <Link
        href={attention.href}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent-hover px-3.5 text-sm font-medium text-white hover:opacity-90"
      >
        Review now
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
      </Link>
    </div>
  );
}
