import type { ReactNode } from "react";
import type { PrimaryRecommendation } from "@/generated/prisma/client";
import type { QASignal, TestGap } from "@/lib/qa-intelligence";
import type { TelemetrySnapshot } from "@/lib/release-governance";
import { parsePostDeployComparison } from "@/lib/release-assess-snapshot";
import type { BriefingCharts } from "@/lib/executive-briefing/types";
import { BriefingDeliverySnapshot } from "@/components/executive-briefing/briefing-delivery-snapshot";
import { BriefingContributors } from "@/components/executive-briefing/briefing-contributors";
import { ReleaseGateBrief } from "@/components/releases/release-gate-brief";

type Props = {
  charts: BriefingCharts;
};

export function BriefingMiniCharts({ charts }: Props) {
  const chartSlots: ReactNode[] = [];

  if (charts.delivery) {
    chartSlots.push(
      <BriefingDeliverySnapshot key="delivery" riskMix={charts.delivery.riskMix} />,
    );
  }

  if (charts.engineering) {
    chartSlots.push(
      <BriefingContributors key="engineering" items={charts.engineering.byAuthor} />,
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
        <div className="grid gap-5 lg:grid-cols-2">{chartSlots}</div>
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
