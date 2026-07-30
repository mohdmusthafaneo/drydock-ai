import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { loadLatestProductivityRun } from "@/lib/agent-analysis/load-latest-runs";
import { PageHeader } from "@/components/layout/page-header";
import { ProductivityRunPanel } from "@/components/productivity/productivity-run-panel";
import { AgentAnalysisRefreshButton } from "@/components/agent-analysis/agent-analysis-refresh-button";

export default async function ProductivityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const run = await loadLatestProductivityRun(session.organizationId);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Productivity"
        description="Contributor mix, weekly cadence, and delivery signals from the productivity agent (auto-refreshed on schedule)."
      >
        <AgentAnalysisRefreshButton label="Refresh all agents" />
      </PageHeader>
      <ProductivityRunPanel run={run} />
    </div>
  );
}
