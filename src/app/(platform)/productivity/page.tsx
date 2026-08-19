import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { loadLatestProductivityRun } from "@/lib/agent-analysis/load-latest-runs";
import { buildProductivityPageView } from "@/lib/agent-analysis/presentation";
import { PageHeader } from "@/components/layout/page-header";
import {
  ProductivityRunPanel,
  ProductivitySignals,
} from "@/components/productivity/productivity-run-panel";
import { AgentAnalysisRefreshButton } from "@/components/agent-analysis/agent-analysis-refresh-button";
import { AgentPageShell } from "@/components/agent-analysis/agent-page-shell";
import { EngineeringDetailSection } from "@/components/agent-analysis/engineering-detail-section";
import { SegmentedShareBar } from "@/components/agent-analysis/segmented-share-bar";
import { WeeklyCadenceChart } from "@/components/agent-analysis/weekly-cadence-chart";

export default async function ProductivityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const run = await loadLatestProductivityRun(session.organizationId);
  const view = buildProductivityPageView(run);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Productivity"
        description="Contributor mix, weekly cadence, and delivery signals from the productivity agent (auto-refreshed on schedule)."
      >
        <AgentAnalysisRefreshButton label="Refresh all agents" />
      </PageHeader>

      <AgentPageShell
        view={view}
        approvalLevelLabels={ctx.approvalLevelLabels}
        afterHighlights={
          run ? (
            <div className="space-y-4">
              <ProductivitySignals
                strongest={view.strongestSignals}
                weakest={view.weakestSignals}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <SegmentedShareBar
                  title="Contributor share"
                  description="Watch concentration at or above 50%"
                  segments={view.contributorSegments}
                />
                <SegmentedShareBar
                  title="Commit mix"
                  description="Type breakdown for the analyzed window"
                  segments={view.commitTypeSegments}
                />
              </div>
              <WeeklyCadenceChart weeks={view.weeklyVolume} />
            </div>
          ) : null
        }
      >
        <div className="space-y-4 border-t border-border-subtle pt-8">
          <EngineeringDetailSection
            title="Contributor table"
            description="Full contributor list for the engineering lead"
            count={run?.contributors.length}
          >
            <ProductivityRunPanel run={run} section="contributors" />
          </EngineeringDetailSection>
          <EngineeringDetailSection
            title="Commit mix detail"
            description="Counts and share by commit type"
            count={run?.commitTypes.length}
          >
            <ProductivityRunPanel run={run} section="commits" />
          </EngineeringDetailSection>
        </div>
      </AgentPageShell>
    </div>
  );
}
