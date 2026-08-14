import type {
  BriefingClaim,
  BriefingClaimVerdict,
  BriefingHighlight,
  HeadlineSegment,
} from "@/lib/executive-briefing/types";
import { scoreToBand } from "@/lib/executive-briefing/health-score";
import { dimensionBandLabel } from "@/lib/executive-briefing/compose-executive-deck";
import type { HealthBand } from "@/lib/executive-briefing/types";
import {
  verdictFromPrimary,
  type GateVerdict,
} from "@/lib/release-gate-brief";
import { isLeadershipApprovalCenterItem } from "@/lib/recommendation-queue";
import type { getOrganizationContext } from "@/lib/org-data";
import { ENTERPRISE_WORKFLOW_STEPS } from "@/lib/enterprise-workflow";

type Ctx = Awaited<ReturnType<typeof getOrganizationContext>>;
type ApprovalRow = Ctx["approvals"][number];

const IMPACT_RANK: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export type ImpactTone = "risk" | "attention" | "neutral" | "good";

export function impactRank(impact: string): number {
  return IMPACT_RANK[impact] ?? 3;
}

export function impactVerdictLabel(impact: string): string {
  switch (impact) {
    case "CRITICAL":
      return "Action needed";
    case "HIGH":
      return "Needs review";
    case "MEDIUM":
      return "Monitor";
    case "LOW":
      return "Informational";
    default:
      return "Review";
  }
}

export function impactTone(impact: string): ImpactTone {
  switch (impact) {
    case "CRITICAL":
      return "risk";
    case "HIGH":
      return "attention";
    default:
      return "neutral";
  }
}

export function statusVerdictLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Awaiting action";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "MODIFIED":
      return "Modification requested";
    default:
      return status.replace(/_/g, " ");
  }
}

export function requiredRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  return role.replace(/_/g, " ");
}

export function sortRecommendationsByUrgency<T extends { impact: string; confidence: number }>(
  recs: T[],
): T[] {
  return [...recs].sort((a, b) => {
    const impactDiff = impactRank(a.impact) - impactRank(b.impact);
    if (impactDiff !== 0) return impactDiff;
    return b.confidence - a.confidence;
  });
}

export function sortPendingApprovals(approvals: ApprovalRow[]): ApprovalRow[] {
  return [...approvals].sort((a, b) => {
    const aRelease = a.recommendation?.releaseId ? 0 : 1;
    const bRelease = b.recommendation?.releaseId ? 0 : 1;
    if (aRelease !== bRelease) return aRelease - bRelease;

    const aImpact = a.recommendation ? impactRank(a.recommendation.impact) : 3;
    const bImpact = b.recommendation ? impactRank(b.recommendation.impact) : 3;
    if (aImpact !== bImpact) return aImpact - bImpact;

    return (b.riskScore ?? 0) - (a.riskScore ?? 0);
  });
}

export function buildApprovalsHeroSummary(ctx: Ctx): {
  headline: string;
  subcopy: string;
} {
  // Leadership gate only — SETUP / OPS belong on Recommendations.
  const pending = ctx.approvals.filter(isLeadershipApprovalCenterItem);
  if (pending.length === 0) {
    return {
      headline: "No leadership actions right now",
      subcopy: "Releases can proceed without your sign-off.",
    };
  }

  const releaseApprovals = pending.filter(
    (a) => a.recommendation?.queue === "RELEASE_GATE" || a.recommendation?.releaseId,
  );
  const governanceApprovals = pending.filter(
    (a) => a.recommendation?.queue === "GOVERNANCE",
  );
  const releaseIds = new Set(
    releaseApprovals
      .map((a) => a.recommendation?.releaseId)
      .filter((id): id is string => Boolean(id)),
  );
  const releaseNames = ctx.releases
    .filter((r) => releaseIds.has(r.id))
    .map((r) => r.name);

  const n = pending.length;

  if (releaseApprovals.length > 0 && releaseNames.length === 1) {
    return {
      headline: `${n} approval${n === 1 ? "" : "s"} blocking ${releaseNames[0]}`,
      subcopy: "Your sign-off is required before this release can deploy.",
    };
  }
  if (releaseApprovals.length > 0 && releaseNames.length > 1) {
    return {
      headline: `${n} approvals waiting across ${releaseNames.length} releases`,
      subcopy: "Review each item below — sign-off is required before deploy.",
    };
  }
  if (releaseApprovals.length > 0) {
    return {
      headline: `${n} release approval${n === 1 ? "" : "s"} waiting`,
      subcopy: "Your sign-off is required before the next release can deploy.",
    };
  }
  if (governanceApprovals.length > 0) {
    return {
      headline: `${n} governance approval${n === 1 ? "" : "s"} waiting`,
      subcopy: "Policy and posture changes need leadership sign-off before they take effect.",
    };
  }

  return {
    headline: `${n} approval${n === 1 ? "" : "s"} awaiting your decision`,
    subcopy: "Human-governed gate — review each item below.",
  };
}

export function buildRecommendationsSummaryHighlights(ctx: Ctx): BriefingHighlight[] {
  // SETUP tasks live on Connect — never inflate OPS triage glance counts.
  const pending = ctx.recommendations.filter(
    (r) => r.status === "PENDING" && r.queue !== "SETUP",
  );
  const criticalHigh = pending.filter((r) => r.impact === "CRITICAL" || r.impact === "HIGH");
  const releaseIds = new Set(
    pending.map((r) => r.releaseId).filter((id): id is string => Boolean(id)),
  );

  const highlights: BriefingHighlight[] = [
    {
      id: "pending",
      label: "Pending review",
      value: String(pending.length),
      tone: pending.length > 0 ? "attention" : "good",
      subtext: pending.length === 0 ? "All recommendations addressed" : undefined,
    },
  ];

  if (criticalHigh.length > 0) {
    highlights.push({
      id: "urgent",
      label: "Critical or high impact",
      value: String(criticalHigh.length),
      tone: "attention",
    });
  }

  if (releaseIds.size > 0) {
    highlights.push({
      id: "releases",
      label: "Releases affected",
      value: String(releaseIds.size),
      subtext: "Linked governance items",
      href: "/releases",
      tone: "neutral",
    });
  }

  if (ctx.stats.pendingApprovals > 0) {
    highlights.push({
      id: "approvals",
      label: "Awaiting sign-off",
      value: String(ctx.stats.pendingApprovals),
      subtext: "In approval center",
      href: "/approvals",
      tone: "attention",
    });
  }

  return highlights.slice(0, 4);
}

const WORKFLOW_MODE_LABELS: Record<string, string> = {
  "lean-mvp": "Lean MVP",
  "scaled-agile": "Scaled agile",
  "enterprise-governed": "Enterprise governed",
};

const AUTONOMY_MODE_LABELS: Record<string, string> = {
  OBSERVE: "Observe only",
  RECOMMEND: "Recommend-only",
  ASSIST: "Assist with approval",
  SEMI_AUTONOMOUS: "Semi-autonomous",
  AUTONOMOUS: "Autonomous",
};

const INCIDENT_STATUS_RANK: Record<string, number> = {
  OPEN: 0,
  INVESTIGATING: 1,
  REMEDIATED: 2,
  CLOSED: 3,
};

export function workflowModeLabel(mode: string): string {
  return WORKFLOW_MODE_LABELS[mode] ?? mode.replace(/-/g, " ");
}

export function autonomyModeLabel(mode: string): string {
  return AUTONOMY_MODE_LABELS[mode] ?? mode.replace(/_/g, " ").toLowerCase();
}

export function approvalLevelLabel(
  level: number,
  customLabels?: { level1?: string; level2?: string; level3?: string; level4?: string },
): string {
  if (level <= 1) return customLabels?.level1 ?? "Team lead sign-off";
  if (level === 2) return customLabels?.level2 ?? "Manager approval";
  if (level === 3) return customLabels?.level3 ?? "Director + compliance";
  if (level >= 4) return customLabels?.level4 ?? "Executive escalation";
  return `Level ${level}`;
}

export function governanceScoreBand(score: number): {
  band: HealthBand;
  bandLabel: string;
} {
  const band = scoreToBand(score);
  return { band, bandLabel: dimensionBandLabel(score) };
}

export function buildGovernanceHeadlineSegments(
  dna: {
    workflowMode: string;
    autonomyMode: string;
    approvalLevel: number;
    riskThreshold: number;
    observabilityStrategy: string | null;
    summary: string | null;
  },
  orgName: string,
  customLabels?: { level1?: string; level2?: string; level3?: string; level4?: string },
): HeadlineSegment[] {
  return buildGovernanceDnaOverview(dna, orgName, customLabels).headlineSegments;
}

export function buildGovernanceDnaOverview(
  dna: {
    workflowMode: string;
    autonomyMode: string;
    approvalLevel: number;
    riskThreshold: number;
    observabilityStrategy: string | null;
  },
  orgName: string,
  customLabels?: { level1?: string; level2?: string; level3?: string; level4?: string },
): { headlineSegments: HeadlineSegment[]; bullets: string[] } {
  const workflow = workflowModeLabel(dna.workflowMode);
  const autonomy = autonomyModeLabel(dna.autonomyMode);
  const approval = approvalLevelLabel(dna.approvalLevel, customLabels);
  const riskPct = Math.round(dna.riskThreshold * 100);

  const headlineSegments: HeadlineSegment[] = [
    { kind: "text", text: `${orgName} runs ` },
    { kind: "emphasis", text: workflow.toLowerCase() },
    { kind: "text", text: " delivery with " },
    { kind: "emphasis", text: "human-governed" },
    { kind: "text", text: " AI recommendations." },
  ];

  const bullets = [
    `${autonomy}: AI suggests next steps; your team approves before anything ships.`,
    `${approval} · releases above ${riskPct}% risk need leadership review.`,
  ];

  if (dna.observabilityStrategy) {
    bullets.push(
      dna.observabilityStrategy.toLowerCase().includes("establish baseline")
        ? "Connect metrics and alerting before expanding automated recommendations."
        : "Production metrics and alerts feed into every release assessment.",
    );
  }

  return { headlineSegments, bullets };
}

export function buildGovernancePolicyHighlights(ctx: Ctx): BriefingHighlight[] {
  const highlights: BriefingHighlight[] = [
    {
      id: "recommendations",
      label: "Pending recommendations",
      value: String(ctx.stats.pendingRecommendations),
      tone: ctx.stats.pendingRecommendations > 0 ? "attention" : "good",
      subtext:
        ctx.stats.pendingRecommendations > 0 ? "Awaiting review" : "All addressed",
      href: "/recommendations",
    },
    {
      id: "approvals",
      label: "Awaiting sign-off",
      value: String(ctx.stats.pendingApprovals),
      tone: ctx.stats.pendingApprovals > 0 ? "attention" : "good",
      subtext: ctx.stats.pendingApprovals > 0 ? "In approval center" : "Nothing blocking",
      href: "/approvals",
    },
  ];

  if (ctx.dna?.updatedAt) {
    highlights.push({
      id: "updated",
      label: "DNA last updated",
      value: ctx.dna.updatedAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      tone: "neutral",
    });
  }

  return highlights.slice(0, 4);
}

export function buildAutonomyVerdictStrip(
  dna: {
    autonomyMode: string;
    approvalLevel: number;
  },
  customLabels?: { level1?: string; level2?: string; level3?: string; level4?: string },
): { label: string; detail: string; tone: BriefingClaimVerdict } {
  const mode = autonomyModeLabel(dna.autonomyMode);
  const approval = approvalLevelLabel(dna.approvalLevel, customLabels);
  const tone: BriefingClaimVerdict =
    dna.autonomyMode === "OBSERVE" || dna.autonomyMode === "RECOMMEND"
      ? "good"
      : "attention";

  return {
    label: `${mode} autonomy`,
    detail: `${approval} · human-governed execution`,
    tone,
  };
}

type IncidentRow = Ctx["incidents"][number];
type ReleaseRow = Ctx["releases"][number];

export function sortIncidentsByUrgency<T extends IncidentRow>(incidents: T[]): T[] {
  return [...incidents].sort((a, b) => {
    const aOpen = a.status === "OPEN" || a.status === "INVESTIGATING" ? 0 : 1;
    const bOpen = b.status === "OPEN" || b.status === "INVESTIGATING" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;

    const severityDiff = b.severityScore - a.severityScore;
    if (severityDiff !== 0) return severityDiff;

    const statusDiff =
      (INCIDENT_STATUS_RANK[a.status] ?? 9) - (INCIDENT_STATUS_RANK[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;

    return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
  });
}

export function incidentSeverityLabel(score: number): string {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 40) return "Moderate";
  return "Low";
}

export function incidentStatusLabel(status: string): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "INVESTIGATING":
      return "Investigating";
    case "REMEDIATED":
      return "Remediated";
    case "CLOSED":
      return "Closed";
    default:
      return status.replace(/_/g, " ");
  }
}

export function buildOpenIncidentsClaim(ctx: Ctx): BriefingClaim {
  const open = ctx.incidents.filter(
    (i) => i.status === "OPEN" || i.status === "INVESTIGATING",
  );

  if (open.length === 0) {
    return {
      id: "incidents-clear",
      headline: "Production is stable",
      metric: "0",
      metricLabel: "Open incidents",
      verdict: "good",
      verdictLabel: "All clear",
      context: "No open incidents affecting your releases.",
    };
  }

  const sorted = sortIncidentsByUrgency(open);
  const top = sorted[0]!;
  const highSeverity = open.some((i) => i.severityScore >= 70);

  return {
    id: "incidents-open",
    headline:
      open.length === 1
        ? top.title
        : `${open.length} production incidents need attention`,
    metric: String(open.length),
    metricLabel: "Open incidents",
    verdict: highSeverity ? "risk" : "attention",
    verdictLabel: highSeverity ? "High severity" : "Needs review",
    context:
      open.length === 1
        ? `Severity ${incidentSeverityLabel(top.severityScore)}${top.release ? ` · linked to ${top.release.name}` : ""}.`
        : `Top item: ${top.title} — assess customer impact before the next release.`,
    href: open.length === 1 ? `/incidents/${top.id}` : undefined,
  };
}

export function buildDeploymentHealthSummary(ctx: Ctx): {
  headline: string;
  subcopy: string;
  verdict: BriefingClaimVerdict;
  verdictLabel: string;
} {
  const degraded = ctx.stats.degradedDeployments;
  const rollback = ctx.stats.rollbackPending;
  const total = ctx.deploymentEvents.length;

  if (rollback > 0) {
    return {
      headline: `${rollback} deployment${rollback === 1 ? "" : "s"} may need rollback`,
      subcopy: "Human approval is required before reversing production changes.",
      verdict: "risk",
      verdictLabel: "Action needed",
    };
  }

  if (degraded > 0) {
    return {
      headline: `${degraded} degraded deployment${degraded === 1 ? "" : "s"} in production`,
      subcopy: `Tracking ${total} recent deployment${total === 1 ? "" : "s"} — review signals below.`,
      verdict: "attention",
      verdictLabel: "Needs review",
    };
  }

  if (total === 0) {
    return {
      headline: "No deployments tracked yet",
      subcopy: "Deploy an approved release to begin deployment health monitoring.",
      verdict: "neutral",
      verdictLabel: "Awaiting data",
    };
  }

  return {
    headline: "Deployments are healthy",
    subcopy: `${total} recent deployment${total === 1 ? "" : "s"} with no degradation signals.`,
    verdict: "good",
    verdictLabel: "Healthy",
  };
}

export function buildDeploymentHealthHighlights(ctx: Ctx): BriefingHighlight[] {
  return [
    {
      id: "tracked",
      label: "Deployments tracked",
      value: String(ctx.deploymentEvents.length),
      tone: "neutral",
    },
    {
      id: "degraded",
      label: "Degraded",
      value: String(ctx.stats.degradedDeployments),
      tone: ctx.stats.degradedDeployments > 0 ? "attention" : "good",
    },
    {
      id: "rollback",
      label: "Rollback recommended",
      value: String(ctx.stats.rollbackPending),
      tone: ctx.stats.rollbackPending > 0 ? "risk" : "good",
      href: ctx.stats.rollbackPending > 0 ? "/approvals" : undefined,
    },
  ];
}

export function releaseStatusLabel(status: string): string {
  switch (status) {
    case "DETECTED":
      return "New";
    case "ASSESSED":
      return "Assessed";
    case "PENDING_APPROVAL":
      return "Awaiting approval";
    case "APPROVED":
      return "Approved";
    case "DEPLOYED":
      return "Live";
    case "BLOCKED":
      return "Blocked";
    default:
      return status.replace(/_/g, " ");
  }
}

export function releaseListVerdict(release: {
  status: string;
  primaryRecommendation: string | null;
  governanceRiskScore: number | null;
}): GateVerdict | null {
  const fromPrimary = verdictFromPrimary(release.primaryRecommendation);
  if (fromPrimary) return fromPrimary;
  if (release.status === "BLOCKED") return "NO-GO";
  if (release.status === "DEPLOYED" || release.status === "APPROVED") return "GO";
  if (release.status === "PENDING_APPROVAL") return "HOLD";
  if (release.governanceRiskScore != null && release.governanceRiskScore >= 60) return "NO-GO";
  if (release.governanceRiskScore != null && release.governanceRiskScore >= 40) return "HOLD";
  return null;
}

export function sortReleasesByRisk<T extends ReleaseRow>(releases: T[]): T[] {
  return [...releases].sort((a, b) => {
    const aBlocked = a.status === "BLOCKED" ? 0 : 1;
    const bBlocked = b.status === "BLOCKED" ? 0 : 1;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;

    const aPending = a.status === "PENDING_APPROVAL" ? 0 : 1;
    const bPending = b.status === "PENDING_APPROVAL" ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;

    const aRisk = a.governanceRiskScore ?? 0;
    const bRisk = b.governanceRiskScore ?? 0;
    if (aRisk !== bRisk) return bRisk - aRisk;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

const STALE_MS = 24 * 60 * 60 * 1000;

function isIntegrationStale(iso: string | null | undefined): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > STALE_MS;
}

export function buildQaOrgVerdict(input: {
  orgReadinessIndex: number;
  pendingDecisions: number;
  openGaps: number;
  noGoCount: number;
  holdCount: number;
  assessedCount: number;
}): {
  headline: string;
  subcopy: string;
  verdict: BriefingClaimVerdict;
  verdictLabel: string;
} {
  const { orgReadinessIndex, pendingDecisions, openGaps, noGoCount, holdCount, assessedCount } =
    input;

  if (assessedCount === 0) {
    return {
      headline: "No releases assessed yet",
      subcopy: "Run an assessment to establish org-wide release confidence.",
      verdict: "neutral",
      verdictLabel: "Awaiting data",
    };
  }

  if (noGoCount > 0) {
    return {
      headline: `${noGoCount} release${noGoCount === 1 ? "" : "s"} blocked from shipping`,
      subcopy: `${pendingDecisions} awaiting human sign-off · ${openGaps} open test gap${openGaps === 1 ? "" : "s"} across the portfolio.`,
      verdict: "risk",
      verdictLabel: "No-go",
    };
  }

  if (pendingDecisions > 0 || holdCount > 0) {
    return {
      headline: `${pendingDecisions + holdCount} release${pendingDecisions + holdCount === 1 ? "" : "s"} need leadership attention`,
      subcopy: `Org readiness ${orgReadinessIndex}% · review gate verdicts before the next deploy.`,
      verdict: "attention",
      verdictLabel: "Hold",
    };
  }

  if (openGaps > 0 || orgReadinessIndex < 70) {
    return {
      headline: "Release confidence needs review",
      subcopy: `${openGaps} open test gap${openGaps === 1 ? "" : "s"} · org readiness ${orgReadinessIndex}%.`,
      verdict: "attention",
      verdictLabel: "Caution",
    };
  }

  return {
    headline: "Release confidence is strong",
    subcopy: `Org readiness ${orgReadinessIndex}% across ${assessedCount} assessed release${assessedCount === 1 ? "" : "s"}.`,
    verdict: "good",
    verdictLabel: "Healthy",
  };
}

export function buildObservabilityStabilitySummary(ctx: Ctx): {
  headline: string;
  subcopy: string;
  verdict: BriefingClaimVerdict;
  verdictLabel: string;
} {
  const openIncidents = ctx.stats.openIncidents;
  const degraded = ctx.stats.degradedDeployments;
  const errorRate = ctx.stats.errorRate;

  if (openIncidents > 0) {
    const highSeverity = ctx.incidents.some(
      (i) =>
        (i.status === "OPEN" || i.status === "INVESTIGATING") && i.severityScore >= 70,
    );
    return {
      headline:
        openIncidents === 1
          ? "1 open production incident"
          : `${openIncidents} open production incidents`,
      subcopy: "Review incident impact before approving the next release.",
      verdict: highSeverity ? "risk" : "attention",
      verdictLabel: highSeverity ? "High severity" : "Needs review",
    };
  }

  if (degraded > 0) {
    return {
      headline: `${degraded} degraded deployment${degraded === 1 ? "" : "s"} in production`,
      subcopy: "Operational signals suggest elevated risk — confirm stability before release.",
      verdict: "attention",
      verdictLabel: "Degraded",
    };
  }

  if (errorRate != null && errorRate > 2) {
    return {
      headline: "Elevated error rate in production",
      subcopy: `HTTP error rate at ${errorRate.toFixed(1)}% — monitor before the next deploy.`,
      verdict: "attention",
      verdictLabel: "Elevated errors",
    };
  }

  if (ctx.stats.metricCount === 0) {
    return {
      headline: "Awaiting observability data",
      subcopy: "Connect Prometheus or Grafana and sync metrics to establish a stability baseline.",
      verdict: "neutral",
      verdictLabel: "Awaiting data",
    };
  }

  return {
    headline: "Production is stable",
    subcopy: "No open incidents or degradation signals in tracked environments.",
    verdict: "good",
    verdictLabel: "Stable",
  };
}

export function buildObservabilityFreshness(
  integrations: Ctx["integrations"],
): { asOf: string; stale: boolean; staleSources: string[] } {
  const prom = integrations.find((i) => i.provider === "PROMETHEUS" && i.status === "CONNECTED");
  const grafana = integrations.find((i) => i.provider === "GRAFANA" && i.status === "CONNECTED");

  const timestamps = [prom?.lastSyncAt, grafana?.lastSyncAt]
    .filter((t): t is Date => Boolean(t))
    .map((t) => t.toISOString());

  const asOf =
    timestamps.length > 0
      ? timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]!
      : new Date().toISOString();

  const staleSources: string[] = [];
  if (prom && isIntegrationStale(prom.lastSyncAt?.toISOString())) staleSources.push("Prometheus");
  if (grafana && isIntegrationStale(grafana.lastSyncAt?.toISOString())) {
    staleSources.push("Grafana");
  }

  return { asOf, stale: staleSources.length > 0, staleSources };
}

export function buildDeliveryConfidenceOneLiner(input: {
  healthScore: number;
  blocked: number;
  overdue: number;
  sprintCompletionPct?: number | null;
}): {
  headline: string;
  subcopy: string;
  verdict: BriefingClaimVerdict;
  verdictLabel: string;
} {
  const { healthScore, blocked, overdue, sprintCompletionPct } = input;

  if (blocked > 0) {
    return {
      headline: `${blocked} blocked item${blocked === 1 ? "" : "s"} across active work`,
      subcopy: `Delivery health ${healthScore}% · resolve blockers before committing to the next release.`,
      verdict: "risk",
      verdictLabel: "Blocked",
    };
  }

  if (overdue > 3 || healthScore < 60) {
    return {
      headline: "Delivery confidence is at risk",
      subcopy: `${overdue} overdue item${overdue === 1 ? "" : "s"} · health score ${healthScore}%.`,
      verdict: "attention",
      verdictLabel: "Caution",
    };
  }

  if (sprintCompletionPct != null && sprintCompletionPct < 50) {
    return {
      headline: "Active sprint is behind pace",
      subcopy: `${sprintCompletionPct}% complete · health score ${healthScore}%.`,
      verdict: "attention",
      verdictLabel: "Behind pace",
    };
  }

  return {
    headline: "Delivery is on track",
    subcopy: `Health score ${healthScore}%${sprintCompletionPct != null ? ` · sprint ${sprintCompletionPct}% complete` : ""}.`,
    verdict: "good",
    verdictLabel: "On track",
  };
}

type GovernanceSignalLike = {
  id: string;
  severity: "info" | "warning" | "error";
  title: string;
};

export function buildCodeAnalysisGovernanceHighlights(
  signals: GovernanceSignalLike[],
): BriefingHighlight[] {
  const errors = signals.filter((s) => s.severity === "error").length;
  const warnings = signals.filter((s) => s.severity === "warning").length;
  const info = signals.filter((s) => s.severity === "info").length;

  if (signals.length === 0) {
    return [
      {
        id: "signals-clear",
        label: "Governance signals",
        value: "0",
        tone: "good",
        subtext: "No policy-relevant patterns detected",
      },
    ];
  }

  return [
    {
      id: "signals-total",
      label: "Active signals",
      value: String(signals.length),
      tone: errors > 0 ? "risk" : warnings > 0 ? "attention" : "neutral",
      subtext: errors > 0 ? "Policy review recommended" : "AI-assisted delivery patterns",
      href: "/approvals",
    },
    {
      id: "signals-critical",
      label: "Critical",
      value: String(errors),
      tone: errors > 0 ? "risk" : "good",
    },
    {
      id: "signals-warning",
      label: "Warnings",
      value: String(warnings),
      tone: warnings > 0 ? "attention" : "good",
    },
    {
      id: "signals-info",
      label: "Informational",
      value: String(info),
      tone: "neutral",
    },
  ];
}

export function buildReleaseDetailVerdict(release: {
  name: string;
  status: string;
  primaryRecommendation: string | null;
  readinessScore: number | null;
  governanceRiskScore: number | null;
  assessedAt: Date | null;
}): {
  headline: string;
  subcopy: string;
  gateVerdict: GateVerdict | null;
  verdictLabel: string;
} {
  if (!release.assessedAt) {
    return {
      headline: "Not yet assessed",
      subcopy: "Run assessment to collect QA, telemetry, and governance signals for a go/no-go verdict.",
      gateVerdict: null,
      verdictLabel: "Awaiting assessment",
    };
  }

  const gateVerdict = releaseListVerdict(release);
  const readiness = Math.round(release.readinessScore ?? 0);

  if (gateVerdict === "NO-GO") {
    return {
      headline: `${release.name} is not ready to ship`,
      subcopy: `Readiness ${readiness}% · governance risk elevated — resolve blockers before approval.`,
      gateVerdict,
      verdictLabel: "No-go",
    };
  }

  if (gateVerdict === "HOLD" || release.status === "PENDING_APPROVAL") {
    return {
      headline: `${release.name} awaits human sign-off`,
      subcopy: `Readiness ${readiness}% · leadership approval required before deployment.`,
      gateVerdict: gateVerdict ?? "HOLD",
      verdictLabel: "Hold",
    };
  }

  if (gateVerdict === "GO" || release.status === "DEPLOYED" || release.status === "APPROVED") {
    return {
      headline: `${release.name} is cleared for controlled deployment`,
      subcopy: `Readiness ${readiness}% · governance gates passed.`,
      gateVerdict: gateVerdict ?? "GO",
      verdictLabel: "Go",
    };
  }

  return {
    headline: `${release.name} assessment complete`,
    subcopy: `Readiness ${readiness}% · review gate brief below for signal detail.`,
    gateVerdict,
    verdictLabel: gateVerdict ?? "Review",
  };
}

export function getWorkflowStepBadges(ctx: Ctx): Record<string, number> {
  return {
    recommendations: ctx.stats.pendingRecommendations,
    approval: ctx.stats.pendingApprovals,
  };
}

export function buildWorkflowAttentionSummary(
  ctx: Ctx,
  completedStepIds: string[],
): {
  headline: string;
  subcopy: string;
  attentionCount: number;
} {
  const incomplete = ENTERPRISE_WORKFLOW_STEPS.filter((s) => !completedStepIds.includes(s.id));
  const urgent =
    ctx.stats.pendingApprovals +
    ctx.stats.pendingRecommendations +
    (ctx.stats.openIncidents > 0 ? 1 : 0);

  if (urgent > 0) {
    const parts: string[] = [];
    if (ctx.stats.pendingApprovals > 0) {
      parts.push(`${ctx.stats.pendingApprovals} approval${ctx.stats.pendingApprovals === 1 ? "" : "s"}`);
    }
    if (ctx.stats.pendingRecommendations > 0) {
      parts.push(
        `${ctx.stats.pendingRecommendations} recommendation${ctx.stats.pendingRecommendations === 1 ? "" : "s"}`,
      );
    }
    if (ctx.stats.openIncidents > 0) {
      parts.push(`${ctx.stats.openIncidents} incident${ctx.stats.openIncidents === 1 ? "" : "s"}`);
    }
    return {
      headline: `${urgent} item${urgent === 1 ? "" : "s"} need attention`,
      subcopy: parts.join(" · "),
      attentionCount: urgent,
    };
  }

  if (incomplete.length > 0) {
    return {
      headline: `${incomplete.length} workflow stage${incomplete.length === 1 ? "" : "s"} remaining`,
      subcopy: `${completedStepIds.length} of ${ENTERPRISE_WORKFLOW_STEPS.length} stages complete.`,
      attentionCount: incomplete.length,
    };
  }

  return {
    headline: "Workflow is fully configured",
    subcopy: "All enterprise delivery stages are complete.",
    attentionCount: 0,
  };
}

export type AuditFilterCategory = "all" | "approvals" | "releases" | "integrations" | "agents";

const APPROVAL_ACTION_PREFIXES = [
  "recommendation.",
  "agent_action.",
  "agent.hire.",
] as const;

const INTEGRATION_ACTION_PREFIXES = [
  "integration.",
  "sync.",
  "prometheus.",
  "github.",
  "jira.",
  "delivery_dna.",
] as const;

export function categorizeAuditAction(action: string): AuditFilterCategory {
  if (APPROVAL_ACTION_PREFIXES.some((p) => action.startsWith(p))) return "approvals";
  if (action.startsWith("release.")) return "releases";
  if (INTEGRATION_ACTION_PREFIXES.some((p) => action.startsWith(p))) return "integrations";
  if (action.startsWith("agent.")) return "agents";
  return "all";
}

export function filterAuditLogs<T extends { action: string }>(
  logs: T[],
  category: AuditFilterCategory,
): T[] {
  if (category === "all") return logs;
  return logs.filter((log) => categorizeAuditAction(log.action) === category);
}

export function countAuditByCategory(logs: { action: string }[]): Record<AuditFilterCategory, number> {
  const counts: Record<AuditFilterCategory, number> = {
    all: logs.length,
    approvals: 0,
    releases: 0,
    integrations: 0,
    agents: 0,
  };
  for (const log of logs) {
    const cat = categorizeAuditAction(log.action);
    if (cat !== "all") counts[cat]++;
  }
  return counts;
}

type AuditLogRow = {
  action: string;
  entityType: string;
  createdAt: Date | string;
  userName?: string | null;
};

export function findLastGovernanceDecision(logs: AuditLogRow[]): AuditLogRow | null {
  const governanceActions = [
    "recommendation.approved",
    "recommendation.rejected",
    "agent_action.approved",
    "agent_action.rejected",
    "release.deployed",
    "agent.hire.approved",
    "agent.hire.rejected",
  ];
  return logs.find((log) => governanceActions.includes(log.action)) ?? null;
}

export function auditActionLabel(action: string): string {
  return action.replace(/\./g, " · ").replace(/_/g, " ");
}

export function buildReleasePortfolioHighlights(releases: ReleaseRow[]): BriefingHighlight[] {
  const inFlight = releases.filter(
    (r) => r.status !== "DEPLOYED" && r.status !== "BLOCKED",
  ).length;
  const pending = releases.filter((r) => r.status === "PENDING_APPROVAL").length;
  const blocked = releases.filter((r) => r.status === "BLOCKED").length;
  const deployed = releases.filter((r) => r.status === "DEPLOYED").length;

  return [
    {
      id: "in-flight",
      label: "In flight",
      value: String(inFlight),
      tone: inFlight > 0 ? "neutral" : "good",
    },
    {
      id: "pending",
      label: "Awaiting approval",
      value: String(pending),
      tone: pending > 0 ? "attention" : "good",
      href: pending > 0 ? "/approvals" : undefined,
    },
    {
      id: "blocked",
      label: "Blocked",
      value: String(blocked),
      tone: blocked > 0 ? "risk" : "good",
    },
    {
      id: "deployed",
      label: "Live in production",
      value: String(deployed),
      tone: "good",
    },
  ];
}
