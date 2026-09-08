import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadComplianceFindings } from "@/lib/compliance/load-findings";
import { loadComplianceFindingSummary } from "@/lib/compliance/summary";
import { hasPermission } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { CodeAnalysisDashboard } from "@/components/code-analysis/code-analysis-dashboard";

export default async function CodeAnalysisPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const canViewCompliance = hasPermission(session, "compliance", "view");
  const canManageCompliance = hasPermission(session, "compliance", "manage");
  const [complianceFindings, complianceSummary] = canViewCompliance
    ? await Promise.all([
        loadComplianceFindings(session.organizationId, { status: "open", limit: 50 }),
        loadComplianceFindingSummary(session.organizationId),
      ])
    : [
        [],
        {
          openCount: 0,
          criticalOpen: 0,
          warningOpen: 0,
          infoOpen: 0,
          lastEvaluatedAt: null,
          resolvedThisWeek: 0,
        },
      ];

  return (
    <div className="w-full space-y-[13px] pb-24 lg:pb-8">
      <PageHeader
        title="Code analysis"
        description="Measure how much of your merged code, commits, and pull requests are human-only, AI-assisted, or fully AI-generated — so leaders can govern AI-native delivery with evidence."
      />

      <CodeAnalysisDashboard
        complianceFindings={complianceFindings}
        complianceOpenCount={complianceSummary.openCount}
        complianceCriticalOpen={complianceSummary.criticalOpen}
        showCompliancePanel={canViewCompliance}
        canManageCompliance={canManageCompliance}
      />
    </div>
  );
}
