import Link from "next/link";
import type { ReactNode } from "react";
import type { PrimaryRecommendation } from "@/generated/prisma/client";
import type { QASignal, TestGap } from "@/lib/qa-intelligence";
import type { TelemetrySnapshot } from "@/lib/release-governance";
import { parsePostDeployComparison } from "@/lib/release-assess-snapshot";
import type { BriefingCharts } from "@/lib/executive-briefing/types";
import { RiskMixChart } from "@/components/delivery-analysis/risk-mix-chart";
import { AuthorBreakdown } from "@/components/code-analysis/repo-breakdown";
import { ReleaseGateBrief } from "@/components/releases/release-gate-brief";

type Props = {
  charts: BriefingCharts;
};

function StabilityMiniChart({
  openAlerts,
  healthScore,
}: {
  openAlerts: number;
  healthScore: number;
}) {
  return (
    <div className="h-full rounded-[24px] border-none bg-pure-white p-5 shadow-[var(--shadow)]">
      <div className="pb-2">
        <h3 className="text-[15px] font-medium text-ink">Production stability</h3>
        <p className="mt-1 text-[13px] text-graphite">Observability snapshot at last sync</p>
      </div>
      <div className="pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[16px] bg-fog px-3 py-3">
            <p className="text-[13px] text-graphite">Health score</p>
            <p className="mt-1 text-[26px] font-medium tabular-nums text-ink">{Math.round(healthScore)}</p>
          </div>
          <div className="rounded-[16px] bg-fog px-3 py-3">
            <p className="text-[13px] text-graphite">Open alerts</p>
            <p className="mt-1 text-[26px] font-medium tabular-nums text-ink">{openAlerts}</p>
          </div>
        </div>
        <Link
          href="/observability"
          className="mt-4 inline-block text-[15px] font-medium text-ink transition-colors hover:text-rust"
        >
          Open observability →
        </Link>
      </div>
    </div>
  );
}

export function BriefingMiniCharts({ charts }: Props) {
  const chartSlots: ReactNode[] = [];

  if (charts.delivery) {
    chartSlots.push(
      <RiskMixChart key="delivery" riskMix={charts.delivery.riskMix} compact />,
    );
  }

  if (charts.engineering && chartSlots.length < 2) {
    chartSlots.push(
      <AuthorBreakdown key="engineering" items={charts.engineering.byAuthor} compact />,
    );
  }

  if (charts.stability && chartSlots.length < 2) {
    chartSlots.push(
      <StabilityMiniChart
        key="stability"
        openAlerts={charts.stability.openAlerts}
        healthScore={charts.stability.healthScore}
      />,
    );
  }

  const hasCharts = chartSlots.length > 0;
  const hasRelease = charts.release != null;

  if (!hasCharts && !hasRelease) {
    return null;
  }

  return (
    <div className="space-y-6">
      {hasCharts && (
        <div className="grid gap-4 lg:grid-cols-2">{chartSlots}</div>
      )}

      {hasRelease && charts.release && (
        <ReleaseGateBrief
          releaseId={charts.release.releaseId}
          releaseName={charts.release.releaseName}
          version={charts.release.version}
          environment={charts.release.environment}
          readinessScore={charts.release.readinessScore}
          governanceRiskScore={charts.release.governanceRiskScore}
          riskLevel={charts.release.riskLevel}
          primaryRecommendation={
            charts.release.primaryRecommendation as PrimaryRecommendation | null
          }
          assessmentSummary={charts.release.assessmentSummary}
          qaSignals={JSON.parse(charts.release.qaSignalsJson || "[]") as QASignal[]}
          testGaps={JSON.parse(charts.release.testGapsJson || "[]") as TestGap[]}
          telemetry={JSON.parse(charts.release.telemetryJson || "{}") as TelemetrySnapshot}
          assessedAt={charts.release.assessedAt}
          pendingApprovals={
            charts.release.pendingApprovalCount > 0
              ? {
                  count: charts.release.pendingApprovalCount,
                  roles: charts.release.pendingApprovalRoles,
                }
              : undefined
          }
          postDeployComparison={parsePostDeployComparison(
            charts.release.postDeployComparisonJson,
          )}
          staleData={charts.release.staleData}
          compact
        />
      )}
    </div>
  );
}
