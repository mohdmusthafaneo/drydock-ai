import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { loadLatestGovernanceRun } from "@/lib/agent-analysis/load-latest-runs";
import { buildCodeHealthPageView } from "@/lib/agent-analysis/presentation";
import { PageHeader } from "@/components/layout/page-header";
import {
  CodeHealthHotspots,
  GovernanceRunPanel,
} from "@/components/governance/governance-run-panel";
import { AgentAnalysisRefreshButton } from "@/components/agent-analysis/agent-analysis-refresh-button";
import { AgentPageShell } from "@/components/agent-analysis/agent-page-shell";
import { EngineeringDetailSection } from "@/components/agent-analysis/engineering-detail-section";

export default async function CodeHealthPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const run = await loadLatestGovernanceRun(session.organizationId);
  const view = buildCodeHealthPageView(run);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Code health"
        description="Change-risk scoring, hotspot files, and dead-code findings from the governance agent (auto-refreshed on schedule)."
      >
        <AgentAnalysisRefreshButton label="Refresh all agents" />
      </PageHeader>

      <AgentPageShell
        view={view}
        afterHighlights={
          <CodeHealthHotspots hotspots={view.topHotspots} drivers={view.riskDrivers} />
        }
      >
        <div className="space-y-4 border-t border-border-subtle pt-8">
          <EngineeringDetailSection
            title="Risk drivers (detail)"
            description="Numeric contributions behind the headline risk."
            count={run?.riskDrivers.length}
          >
            <GovernanceRunPanel run={run} section="drivers" />
          </EngineeringDetailSection>
          <EngineeringDetailSection
            title="All hotspot files"
            description="Full paths for engineering review"
            count={run?.worstFiles.length}
          >
            <GovernanceRunPanel run={run} section="files" />
          </EngineeringDetailSection>
          <EngineeringDetailSection
            title={`${view.cleanupReadyCount} cleanup-ready`}
            description={
              run && run.deadCodeCount > 0
                ? `${run.deadCodeCount} dead-code candidates from the governance agent`
                : "Dead-code candidates from the governance agent"
            }
            count={run?.deadCodeCount}
          >
            <GovernanceRunPanel run={run} section="dead-code" />
          </EngineeringDetailSection>
          {view.agentNotes ? (
            <EngineeringDetailSection
              title="Agent notes"
              description="Raw summary string from the governance agent"
            >
              <GovernanceRunPanel run={run} section="notes" />
            </EngineeringDetailSection>
          ) : null}
        </div>
      </AgentPageShell>
    </div>
  );
}
