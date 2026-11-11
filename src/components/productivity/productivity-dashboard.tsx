"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ProductivityKpiStrip } from "@/components/productivity/productivity-kpi-strip";
import { ProductivityContributorTable } from "@/components/productivity/productivity-contributor-table";
import {
  ProductivityReviewLoadCard,
  ProductivityThroughputCard,
} from "@/components/productivity/productivity-charts";
import { ProductivityAiTokensTable } from "@/components/productivity/productivity-ai-tokens-table";
import {
  selectAiSnapshot,
  selectProductivitySnapshot,
  useAppData,
} from "@/lib/store";
import type { CursorAiSnapshot } from "@/lib/cursor-api/types";
import type { ProductivitySnapshot } from "@/lib/productivity/types";
import { cn } from "@/lib/utils";

function snapshotEqual(a: ProductivitySnapshot, b: ProductivitySnapshot): boolean {
  return (
    a.sprintId === b.sprintId &&
    a.teamKey === b.teamKey &&
    a.totals.prsMerged === b.totals.prsMerged &&
    a.totals.reviewsGiven === b.totals.reviewsGiven &&
    a.contributors.length === b.contributors.length &&
    a.contributors[0]?.contributor.id === b.contributors[0]?.contributor.id &&
    a.contributors[0]?.prsMerged === b.contributors[0]?.prsMerged
  );
}

function aiSnapshotEqual(a: CursorAiSnapshot, b: CursorAiSnapshot): boolean {
  return (
    a.fetchedAt === b.fetchedAt &&
    a.contributors.length === b.contributors.length &&
    a.contributors[0]?.contributorId === b.contributors[0]?.contributorId &&
    a.contributors[0]?.tokens === b.contributors[0]?.tokens
  );
}

export function ProductivityDashboard({ className }: { className?: string }) {
  const snapshot = useAppData(selectProductivitySnapshot, snapshotEqual);
  const aiSnapshot = useAppData(selectAiSnapshot, aiSnapshotEqual);
  // Avoid SSR/client filter-timing mismatches (URL sync runs after mount).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      className={cn("w-full space-y-[13px] pb-24 lg:pb-8", className)}
      data-slot="productivity-dashboard"
    >
      <PageHeader
        title="Productivity"
        description="Per-contributor delivery metrics and AI token spend for this sprint."
        className="mb-[18px] [&_p]:mt-[5px]"
      />

      {!mounted ? (
        <div className="h-40 animate-pulse rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]" />
      ) : (
        <>
          <ProductivityKpiStrip totals={snapshot.totals} />

          <ProductivityContributorTable snapshot={snapshot} />

          <ProductivityAiTokensTable rows={aiSnapshot.contributors} />

          <div className="grid gap-3 lg:grid-cols-2">
            <ProductivityThroughputCard points={snapshot.throughputTrend} />
            <ProductivityReviewLoadCard
              rows={snapshot.reviewLoad}
              caption={snapshot.reviewLoadCaption}
            />
          </div>
        </>
      )}
    </div>
  );
}
