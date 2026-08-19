import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { loadLatestQaRun } from "@/lib/agent-analysis/load-latest-runs";
import { buildQaPageView } from "@/lib/agent-analysis/presentation";
import { syncAgentAnalysisRecommendations } from "@/lib/agent-analysis/sync-recommendations";
import { dismissStaleSetupRecommendations } from "@/lib/agent-analysis/dismiss-stale-setup-recs";
import { formatDistanceToNow } from "@/lib/format-date";
import { QACockpit } from "@/components/qa/qa-cockpit";
import { AgentAnalysisRefreshButton } from "@/components/agent-analysis/agent-analysis-refresh-button";
import { AgentPageShell } from "@/components/agent-analysis/agent-page-shell";
import { BriefingContextChip } from "@/components/briefing/briefing-context-chip";
import { DataTrustStrip } from "@/components/trust/data-trust-strip";
import { PageHeader } from "@/components/layout/page-header";
import { QaEvidenceSection } from "@/components/qa/qa-evidence-section";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function QAIntelligencePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;

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
  const assessedReleases = ctx.releases.filter((r) => r.assessedAt);
  const showReleaseCockpit = assessedReleases.length > 0;

  const view = buildQaPageView(qaRun);

  const lastSyncLabel = qaRun?.analyzedAt
    ? formatDistanceToNow(new Date(qaRun.analyzedAt))
    : null;
  const blindSpots: string[] = [];
  if (!qaRun) blindSpots.push("QA agent scan not available");
  const jira = ctx.integrations.find((i) => i.provider === "JIRA");
  if (!jira) blindSpots.push("Jira not connected");

  return (
    <div className="space-y-8">
      <PageHeader
        title="QA intelligence"
        description="Board health from the QA agent — blocked work and open bugs that gate release confidence."
      >
        <AgentAnalysisRefreshButton label="Refresh all agents" />
      </PageHeader>

      <BriefingContextChip from={sp.from} />
      <DataTrustStrip lastSyncLabel={lastSyncLabel} blindSpots={blindSpots} />

      <AgentPageShell view={view} approvalLevelLabels={ctx.approvalLevelLabels}>
        <div className="space-y-4 border-t border-border-subtle pt-8">
          <QaEvidenceSection run={qaRun} />
        </div>
      </AgentPageShell>

      {showReleaseCockpit ? (
        <div className="border-t border-border-subtle pt-8">
          <QACockpit
            orgReadinessIndex={ctx.stats.releaseReadiness}
            releases={ctx.releases}
            integrations={ctx.integrations}
            pendingApprovalReleaseIds={pendingApprovalReleaseIds}
          />
        </div>
      ) : null}
    </div>
  );
}
