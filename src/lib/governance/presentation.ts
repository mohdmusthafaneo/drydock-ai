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
import type { getOrganizationContext } from "@/lib/org-data";

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
  const pending = ctx.approvals.filter((a) => !a.decision);
  if (pending.length === 0) {
    return {
      headline: "No leadership actions right now",
      subcopy: "Releases can proceed without your sign-off.",
    };
  }

  const releaseApprovals = pending.filter(
    (a) => a.type !== "AGENT_HIRE" && a.recommendation?.releaseId,
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

  const agentHires = pending.filter((a) => a.type === "AGENT_HIRE").length;
  if (agentHires > 0 && agentHires === n) {
    return {
      headline: `${n} agent hire${n === 1 ? "" : "s"} awaiting approval`,
      subcopy: "No new agents are activated without your sign-off.",
    };
  }

  return {
    headline: `${n} approval${n === 1 ? "" : "s"} awaiting your decision`,
    subcopy: "Human-governed gate — nothing deploys or activates without approval.",
  };
}

export function buildRecommendationsSummaryHighlights(ctx: Ctx): BriefingHighlight[] {
  const pending = ctx.recommendations.filter((r) => r.status === "PENDING");
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

export function approvalLevelLabel(level: number): string {
  if (level <= 1) return "Team lead sign-off";
  if (level === 2) return "Manager approval";
  if (level === 3) return "Director + compliance";
  if (level >= 4) return "Executive escalation";
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
  dna: { summary: string | null },
  orgName: string,
): HeadlineSegment[] {
  if (dna.summary) {
    const sentence = dna.summary.split(/(?<=[.!])\s+/)[0]?.trim() ?? dna.summary;
    return [{ kind: "text", text: sentence }];
  }
  return [
    { kind: "text", text: `${orgName} delivery governance is ` },
    { kind: "emphasis", text: "active" },
    { kind: "text", text: " with human approval gates on all AI recommendations." },
  ];
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

export function buildAutonomyVerdictStrip(dna: {
  autonomyMode: string;
  approvalLevel: number;
}): { label: string; detail: string; tone: BriefingClaimVerdict } {
  const mode = autonomyModeLabel(dna.autonomyMode);
  const approval = approvalLevelLabel(dna.approvalLevel);
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
