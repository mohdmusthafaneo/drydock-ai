"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { BriefingContextChip } from "@/components/briefing/briefing-context-chip";
import { DataTrustStrip } from "@/components/trust/data-trust-strip";
import { DeliveryAnalysisDashboard } from "@/components/delivery-analysis/delivery-analysis-dashboard";
import { ConnectJiraEmpty } from "@/components/delivery-analysis/connect-jira-empty";
import { useAppData, useFilters } from "@/lib/store";
import { formatDistanceToNow } from "@/lib/format-date";

type Props = {
  from?: string | string[] | undefined;
};

export function DeliveryAnalysisFromStore({ from }: Props) {
  const snapshot = useAppData((s) => s.data.deliveryAnalysis.snapshot);
  const lastSyncAt = useAppData((s) => s.data.meta.lastSyncAt);
  const { team } = useFilters();

  const projectKeys = snapshot?.projectKeys ?? [];
  const lastSyncLabel = lastSyncAt
    ? formatDistanceToNow(new Date(lastSyncAt))
    : null;

  const blindSpots = useMemo(() => {
    const spots: string[] = [];
    if (!snapshot) spots.push("Delivery snapshot not available");
    return spots;
  }, [snapshot]);

  return (
    <div className="space-y-4">
      <BriefingContextChip from={from} />
      <DataTrustStrip lastSyncLabel={lastSyncLabel} blindSpots={blindSpots} />
      <div className="w-full space-y-[13px] pb-24 lg:pb-8">
        <PageHeader
          title="Delivery analysis"
          description="See blockers, overdue work, version targets, and sprint progress from Jira — so leaders can govern delivery with evidence, not dashboard hopping."
        />

        {snapshot ? (
          <DeliveryAnalysisDashboard
            projectKeys={projectKeys}
            lastSyncedAt={lastSyncAt}
            initialProjectKey={team}
          />
        ) : (
          <ConnectJiraEmpty />
        )}
      </div>
    </div>
  );
}
