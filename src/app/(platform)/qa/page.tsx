import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { loadLatestQaRun } from "@/lib/agent-analysis/load-latest-runs";
import { syncAgentAnalysisRecommendations } from "@/lib/agent-analysis/sync-recommendations";
import { dismissStaleSetupRecommendations } from "@/lib/agent-analysis/dismiss-stale-setup-recs";
import { QACockpit } from "@/components/qa/qa-cockpit";
import { QaAgentRunPanel } from "@/components/qa/qa-agent-run-panel";
import { AgentAnalysisRefreshButton } from "@/components/agent-analysis/agent-analysis-refresh-button";
import { PageHeader } from "@/components/layout/page-header";

export default async function QAIntelligencePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [ctx, qaRun] = await Promise.all([
    getOrganizationContext(session.organizationId),
    loadLatestQaRun(session.organizationId),
  ]);
  if (!ctx.dna) redirect("/governance/setup");

  void syncAgentAnalysisRecommendations(session.organizationId, {
    qa: qaRun,
    devops: null,
    governance: null,
    productivity: null,
    freshness: [],
  }).catch(() => undefined);
  void dismissStaleSetupRecommendations(session.organizationId).catch(() => undefined);

  const pendingApprovalReleaseIds = new Set(
    ctx.releases.filter((r) => r.status === "PENDING_APPROVAL").map((r) => r.id),
  );
  // Only show the release cockpit when at least one release has been assessed —
  // otherwise the agent QA panel is the source of truth.
  const assessedReleases = ctx.releases.filter((r) => r.assessedAt);
  const showReleaseCockpit = assessedReleases.length > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="QA intelligence"
        description="Board health from the QA agent — blocked work and open bugs that gate release confidence."
      >
        <AgentAnalysisRefreshButton label="Refresh all agents" />
      </PageHeader>
      <QaAgentRunPanel run={qaRun} />
      {showReleaseCockpit ? (
        <QACockpit
          orgReadinessIndex={ctx.stats.releaseReadiness}
          releases={ctx.releases}
          integrations={ctx.integrations}
          pendingApprovalReleaseIds={pendingApprovalReleaseIds}
        />
      ) : null}
    </div>
  );
}
