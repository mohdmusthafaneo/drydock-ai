"use client";

import { PageHeader } from "@/components/layout/page-header";
import { BriefingContextChip } from "@/components/briefing/briefing-context-chip";
import { DataTrustStrip } from "@/components/trust/data-trust-strip";
import { AgentPageShell } from "@/components/agent-analysis/agent-page-shell";
import { AgentAnalysisRefreshButton } from "@/components/agent-analysis/agent-analysis-refresh-button";
import type { AgentPageView } from "@/lib/agent-analysis/types";
import { useAppData } from "@/lib/store";
import { formatDistanceToNow } from "@/lib/format-date";

type Props = {
  from?: string | string[] | undefined;
};

export function QaFromStore({ from }: Props) {
  const qa = useAppData((s) => s.data.qa);
  const lastSyncAt = useAppData((s) => s.data.meta.lastSyncAt);

  const view = (qa.view as AgentPageView | null) ?? {
    hero: {
      verdict: "neutral" as const,
      verdictLabel: "Awaiting data",
      headline: "No QA scan yet",
      subcopy: "Connect Jira projects and refresh agents to see blocked work and open bugs.",
    },
    highlights: [],
    decisions: [
      {
        id: "configure",
        audience: "engineering" as const,
        title: "Run the next agent refresh",
        detail: "Connect the required integration, then use Refresh all agents.",
        href: "/integrations",
        ctaLabel: "Open integrations",
        tone: "neutral" as const,
      },
    ],
    scope: "QA board health",
  };

  const lastSyncLabel = lastSyncAt
    ? formatDistanceToNow(new Date(lastSyncAt))
    : null;
  const blindSpots: string[] = [];
  if (qa.empty || !qa.view) blindSpots.push("QA agent scan not available");

  return (
    <div className="space-y-[13px]">
      <PageHeader
        title="QA intelligence"
        description="Board health from the QA agent — blocked work and open bugs that gate release confidence."
      >
        <AgentAnalysisRefreshButton label="Refresh all agents" />
      </PageHeader>

      <BriefingContextChip from={from} />
      <DataTrustStrip lastSyncLabel={lastSyncLabel} blindSpots={blindSpots} />

      <AgentPageShell view={view}>
        {qa.empty ? (
          <div className="border-t border-border pt-8">
            <p className="text-sm text-secondary">
              Demo empty — refresh agents after connecting Jira for live board evidence.
            </p>
          </div>
        ) : null}
      </AgentPageShell>
    </div>
  );
}
