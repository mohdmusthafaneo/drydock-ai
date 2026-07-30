import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { loadLatestGovernanceRun } from "@/lib/agent-analysis/load-latest-runs";
import { PageHeader } from "@/components/layout/page-header";
import { GovernanceRunPanel } from "@/components/governance/governance-run-panel";
import { AgentAnalysisRefreshButton } from "@/components/agent-analysis/agent-analysis-refresh-button";

export default async function CodeHealthPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const run = await loadLatestGovernanceRun(session.organizationId);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Code health"
        description="Change-risk scoring, hotspot files, and dead-code findings from the governance agent (auto-refreshed on schedule)."
      >
        <AgentAnalysisRefreshButton label="Refresh all agents" />
      </PageHeader>
      <GovernanceRunPanel run={run} />
    </div>
  );
}
