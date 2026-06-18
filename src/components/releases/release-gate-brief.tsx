import Link from "next/link";
import type { PrimaryRecommendation, ReleaseRiskLevel } from "@/generated/prisma/client";
import type { QASignal, TestGap } from "@/lib/qa-intelligence";
import type { TelemetrySnapshot } from "@/lib/release-governance";
import type { PostDeployComparison, SourceFreshness } from "@/lib/release-assess-snapshot";
import {
  aggregateGapsByArea,
  formatObservabilityAttribution,
  groupSignalsByArea,
  sourceBadgeLabel,
  topBlockers,
  verdictBadgeVariant,
  verdictFromPrimary,
  type GateVerdict,
} from "@/lib/release-gate-brief";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function severityVariant(severity: QASignal["severity"]): "warning" | "muted" | "error" {
  if (severity === "critical") return "error";
  if (severity === "warning") return "warning";
  return "muted";
}

export type PendingApprovalInfo = {
  count: number;
  roles: string[];
};

export type ReleaseGateBriefProps = {
  releaseName: string;
  version?: string | null;
  environment: string;
  readinessScore: number | null;
  governanceRiskScore: number | null;
  riskLevel: ReleaseRiskLevel | string | null;
  primaryRecommendation: PrimaryRecommendation | null;
  assessmentSummary?: string | null;
  qaSignals: QASignal[];
  testGaps: TestGap[];
  telemetry: TelemetrySnapshot;
  assessedAt?: Date | string | null;
  pendingApprovals?: PendingApprovalInfo;
  sourceFreshness?: SourceFreshness[];
  staleData?: boolean;
  postDeployComparison?: PostDeployComparison | null;
  compact?: boolean;
  releaseId?: string;
};

function VerdictBadge({ verdict }: { verdict: GateVerdict | null }) {
  if (!verdict) return null;
  return (
    <Badge variant={verdictBadgeVariant(verdict)} className="px-3 py-1 text-sm">
      {verdict}
    </Badge>
  );
}

function ScoreStrip({
  readinessScore,
  governanceRiskScore,
  riskLevel,
}: {
  readinessScore: number | null;
  governanceRiskScore: number | null;
  riskLevel: ReleaseRiskLevel | string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-[16px] bg-fog px-3 py-2">
        <p className="text-xs text-muted">QA readiness</p>
        <p className="text-xl font-medium text-ink">{Math.round(readinessScore ?? 0)}%</p>
      </div>
      <div className="rounded-[16px] bg-fog px-3 py-2">
        <p className="text-xs text-muted">Governance risk</p>
        <p className="text-xl font-medium text-ink">{Math.round(governanceRiskScore ?? 0)}%</p>
      </div>
      <div className="rounded-[16px] bg-fog px-3 py-2">
        <p className="text-xs text-muted">Risk level</p>
        <p className="text-xl font-medium text-ink">{riskLevel ?? "—"}</p>
      </div>
    </div>
  );
}

function SignalGroupSection({
  groups,
  expandable,
}: {
  groups: ReturnType<typeof groupSignalsByArea>;
  expandable: boolean;
}) {
  if (groups.length === 0) return null;

  const content = groups.map((group) => (
    <div key={group.id} className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{group.label}</p>
      <div className="space-y-1.5">
        {group.signals.map((signal) => (
          <div
            key={signal.id}
            className="flex flex-wrap items-start justify-between gap-2 rounded-[16px] bg-fog px-3 py-2 text-sm"
          >
            <span>
              <span className="text-muted">{signal.label}: </span>
              <span className="text-ink">{signal.value}</span>
              {signal.source && (
                <Badge variant="muted" className="ml-2 text-[10px]">
                  {sourceBadgeLabel(signal.source)}
                </Badge>
              )}
            </span>
            <Badge variant={severityVariant(signal.severity)}>{signal.category}</Badge>
          </div>
        ))}
      </div>
    </div>
  ));

  if (!expandable) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-ink hover:text-rust">
        Signal details ({groups.reduce((n, g) => n + g.signals.length, 0)})
      </summary>
      <div className="mt-4 space-y-4">{content}</div>
    </details>
  );
}

export function ReleaseGateBrief({
  releaseName,
  version,
  environment,
  readinessScore,
  governanceRiskScore,
  riskLevel,
  primaryRecommendation,
  assessmentSummary,
  qaSignals,
  testGaps,
  telemetry,
  assessedAt,
  pendingApprovals,
  sourceFreshness,
  staleData,
  postDeployComparison,
  compact = false,
  releaseId,
}: ReleaseGateBriefProps) {
  const verdict = verdictFromPrimary(primaryRecommendation);
  const blockers = topBlockers(testGaps);
  const signalGroups = groupSignalsByArea(qaSignals);
  const observabilityLabel = formatObservabilityAttribution(telemetry);
  const openAlerts = telemetry.openIncidents ?? 0;

  return (
    <Card>
      <CardHeader className={compact ? "pb-3" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle
              className={
                compact
                  ? "text-base"
                  : "font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink"
              }
            >
              Release gate brief
              {!compact && (
                <span className="ml-2 font-sans text-base font-normal text-muted">
                  {releaseName}
                  {version ? ` (${version})` : ""} · {environment}
                </span>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              AIDOS recommends; your team approves. Every score is explainable and source-attributed.
            </CardDescription>
          </div>
          <VerdictBadge verdict={verdict} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {staleData && (
          <div className="rounded-[16px] border border-warning/30 bg-warning-muted px-3 py-2 text-sm text-warning">
            Assessment used integration data older than 24 hours — re-sync sources or re-assess
            before deciding.
          </div>
        )}

        <ScoreStrip
          readinessScore={readinessScore}
          governanceRiskScore={governanceRiskScore}
          riskLevel={riskLevel}
        />

        {assessmentSummary && !compact && (
          <p className="text-sm text-ash">{assessmentSummary}</p>
        )}

        {blockers.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Top blockers</p>
            <ul className="space-y-1.5">
              {blockers.map((gap, i) => (
                <li
                  key={`${gap.area}-${i}`}
                  className="flex flex-wrap items-center gap-2 rounded-[16px] bg-fog px-3 py-2 text-sm"
                >
                  <span className="font-medium text-ink">{gap.area}</span>
                  <span className="text-muted">— {gap.gap}</span>
                  <Badge variant={gap.priority === "high" ? "warning" : "muted"}>
                    {gap.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {signalGroups.length > 0 && (
          <SignalGroupSection groups={signalGroups} expandable={!compact} />
        )}

        {(observabilityLabel || openAlerts > 0) && (
          <div className="rounded-[16px] border border-border-subtle px-3 py-2 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Observability
            </p>
            {observabilityLabel && <p className="mt-1 text-ash">{observabilityLabel}</p>}
            <p className="mt-1 text-muted">
              {openAlerts} open alert{openAlerts === 1 ? "" : "s"} at assess time
            </p>
          </div>
        )}

        {postDeployComparison && (
          <div
            className={
              postDeployComparison.degraded
                ? "rounded-[16px] border border-warning/30 bg-warning-muted px-3 py-2 text-sm text-warning"
                : "rounded-[16px] border border-success/20 bg-success-muted px-3 py-2 text-sm text-success"
            }
          >
            <p className="font-medium">
              {postDeployComparison.degraded ? "Post-deploy degradation" : "Post-deploy stable"}
            </p>
            <p className="mt-1">{postDeployComparison.summary}</p>
            {postDeployComparison.rollbackRecommended && (
              <p className="mt-2 text-error">
                Rollback recommendation pending — review Approval Center.
              </p>
            )}
          </div>
        )}

        {pendingApprovals && pendingApprovals.count > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[16px] border border-warning/20 bg-warning-muted px-3 py-2 text-sm text-warning">
            <span>
              {pendingApprovals.count} pending approval
              {pendingApprovals.count === 1 ? "" : "s"}
              {pendingApprovals.roles.length > 0 &&
                ` · ${pendingApprovals.roles.join(", ")}`}
            </span>
            <Link href="/approvals" className="font-medium text-ink hover:text-rust">
              Approval Center →
            </Link>
          </div>
        )}

        {sourceFreshness && sourceFreshness.length > 0 && !compact && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Source freshness
            </p>
            <div className="flex flex-wrap gap-2">
              {sourceFreshness.map((source) => (
                <Badge
                  key={source.id}
                  variant={source.synced ? "accent" : source.connected ? "warning" : "muted"}
                >
                  {source.label}
                  {source.lastSyncedAt
                    ? ` · ${formatRelative(source.lastSyncedAt)}`
                    : source.connected
                      ? " · not synced"
                      : " · disconnected"}
                </Badge>
              ))}
            </div>
            {assessedAt && (
              <p className="mt-2 text-xs text-muted">
                Assessed {formatRelative(new Date(assessedAt).toISOString())}
              </p>
            )}
          </div>
        )}

        {compact && releaseId && (
          <Link
            href={`/releases/${releaseId}`}
            className="inline-block text-sm font-medium text-ink hover:text-rust"
          >
            Open release →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export { aggregateGapsByArea };
