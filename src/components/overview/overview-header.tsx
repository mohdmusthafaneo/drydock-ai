import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

export function OverviewHeader({
  model,
  className,
}: {
  model: OverviewDashboardModel;
  className?: string;
}) {
  return (
    <div
      className={cn("mb-[18px]", className)}
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
    </div>
  );
}
