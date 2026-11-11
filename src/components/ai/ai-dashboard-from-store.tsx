"use client";

import { useEffect, useState } from "react";
import { AiDashboard } from "@/components/ai/ai-dashboard";
import {
  selectAiSnapshot,
  useAppData,
} from "@/lib/store";
import type { CursorAiSnapshot } from "@/lib/cursor-api/types";

function snapshotEqual(a: CursorAiSnapshot, b: CursorAiSnapshot): boolean {
  return (
    a.fetchedAt === b.fetchedAt &&
    a.kpis.latestDau === b.kpis.latestDau &&
    a.kpis.agentAcceptRatePct === b.kpis.agentAcceptRatePct &&
    a.kpis.tabAcceptRatePct === b.kpis.tabAcceptRatePct &&
    a.kpis.aiCommitsTracked === b.kpis.aiCommitsTracked &&
    a.commits.length === b.commits.length &&
    a.commits[0]?.commitHash === b.commits[0]?.commitHash &&
    a.dau.length === b.dau.length &&
    a.tokenSpend.totalTokens === b.tokenSpend.totalTokens &&
    a.roi.netValueUsd === b.roi.netValueUsd &&
    a.tickets.length === b.tickets.length &&
    a.tools.length === b.tools.length
  );
}

export function AiDashboardFromStore({ className }: { className?: string }) {
  const snapshot = useAppData(selectAiSnapshot, snapshotEqual);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className="h-40 animate-pulse rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]"
        data-slot="ai-dashboard-skeleton"
      />
    );
  }

  return <AiDashboard snapshot={snapshot} className={className} />;
}
