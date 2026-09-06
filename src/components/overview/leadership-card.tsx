import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card
      className={cn(
        "rounded-[12px] border-border shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        className,
      )}
      data-slot="leadership-card"
    >
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
            <Users className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Waiting on leadership</p>
            <p className="mt-0.5 text-sm text-muted">
              {leadership.count} decision{leadership.count === 1 ? "" : "s"} needed
            </p>
          </div>
        </div>
        <Link
          href={leadership.href}
          className="inline-flex w-fit items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-hover"
        >
          View details →
        </Link>
      </CardContent>
    </Card>
  );
}
