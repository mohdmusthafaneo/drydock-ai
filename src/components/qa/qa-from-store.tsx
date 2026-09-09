"use client";

import { PageHeader } from "@/components/layout/page-header";
import { BriefingContextChip } from "@/components/briefing/briefing-context-chip";
import { DataTrustStrip } from "@/components/trust/data-trust-strip";
import { AgentPageShell } from "@/components/agent-analysis/agent-page-shell";
import { AgentAnalysisRefreshButton } from "@/components/agent-analysis/agent-analysis-refresh-button";
import { SuiteHealthPanel } from "@/components/qa/suite-health-panel";
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
      headline: "No suite scan yet",
      subcopy: "Connect the test repository and refresh to see suite-health issues.",
    },
    highlights: [],
    decisions: [
      {
        id: "configure",
        audience: "engineering" as const,
        title: "Connect the test repository",
        detail: "Add the integration, then use Refresh all agents.",
        href: "/integrations",
        ctaLabel: "Open integrations",
        tone: "neutral" as const,
      },
    ],
    scope: "Test suite health",
  };

  const lastSyncLabel = lastSyncAt
    ? formatDistanceToNow(new Date(lastSyncAt))
    : null;
  const blindSpots: string[] = [];
  if (qa.empty || !qa.view) blindSpots.push("QA scan not available");
  if (!qa.suiteHealth) blindSpots.push("Suite-health details not available");

  return (
    <div className="space-y-[13px]">
      <PageHeader
        title="QA"
        description="Issues found in the automation suite."
      >
        <AgentAnalysisRefreshButton label="Refresh" />
      </PageHeader>

      <BriefingContextChip from={from} />
      <DataTrustStrip lastSyncLabel={lastSyncLabel} blindSpots={blindSpots} />

      <AgentPageShell
        view={view}
        engineeringSection={{
          title: "What to do next",
          description: "Highest-leverage moves for this suite.",
        }}
      >
        {qa.suiteHealth ? <SuiteHealthPanel snapshot={qa.suiteHealth} /> : null}
        {qa.empty ? (
          <div className="border-t border-border pt-8">
            <p className="text-sm text-secondary">
              No suite scan yet — connect the test repository and refresh.
            </p>
          </div>
        ) : null}
      </AgentPageShell>
    </div>
  );
}
