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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Production stability</CardTitle>
        <CardDescription className="text-xs">Observability snapshot at last sync</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-elevated/60 px-3 py-2">
            <p className="text-xs text-muted">Health score</p>
            <p className="text-xl font-semibold tabular-nums">{Math.round(healthScore)}</p>
          </div>
          <div className="rounded-lg bg-elevated/60 px-3 py-2">
            <p className="text-xs text-muted">Open alerts</p>
            <p className="text-xl font-semibold tabular-nums">{openAlerts}</p>
          </div>
        </div>
        <Link
          href="/observability"
          className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
        >
          Open observability →
        </Link>
      </CardContent>
    </Card>
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
