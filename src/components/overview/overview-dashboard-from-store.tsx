"use client";

import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { OverviewDashboardSkeleton } from "@/components/overview/overview-dashboard-skeleton";
import { useAppData, useStoreStatus, selectOverviewModel } from "@/lib/store";
import { cn } from "@/lib/utils";

export function OverviewDashboardFromStore({
  className,
}: {
  className?: string;
}) {
  const status = useStoreStatus();
  const model = useAppData(selectOverviewModel);

  if (status !== "ready") {
    return <OverviewDashboardSkeleton className={className} />;
  }

  return <OverviewDashboard model={model} className={cn(className)} />;
}
