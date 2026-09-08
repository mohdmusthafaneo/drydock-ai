"use client";

import { useEffect, useState } from "react";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { OverviewDashboardSkeleton } from "@/components/overview/overview-dashboard-skeleton";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

/** Demo delay so chart skeletons are visible before content paints. */
const SHOWCASE_LOAD_MS = 2000;

export function OverviewDashboardClient({
  model,
  className,
}: {
  model: OverviewDashboardModel;
  className?: string;
}) {
  const [ready, setReady] = useState(false);

  // Re-run the showcase delay when team/sprint filters change.
  const loadKey = `${model.teamKey ?? "all"}:${model.sprint.id}`;

  useEffect(() => {
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), SHOWCASE_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [loadKey]);

  if (!ready) {
    return <OverviewDashboardSkeleton className={className} />;
  }

  return <OverviewDashboard model={model} className={cn(className)} />;
}
