import { computeDeliveryHealthScore } from "@/lib/executive-briefing/health-score";
import type {
  BriefingClaim,
  ExecutiveBriefing,
  HealthBand,
} from "@/lib/executive-briefing/types";
import type { HealthScoreInput } from "@/lib/executive-briefing/health-score";
import type { DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";
import type { CodeAnalysisSnapshot } from "@/lib/code-analysis/types";

export type ComposeBriefingInput = HealthScoreInput & {
  orgName: string;
  assessmentSummary?: string | null;
  integrationFreshness: {
    jiraSyncedAt?: string | null;
    githubSyncedAt?: string | null;
    observabilitySyncedAt?: string | null;
  };
  connectedTools: number;
  activeAuthors?: number;
  topAuthors?: { login: string; commits: number }[];
};

const BANNED_L1_TERMS = [
  "telemetry",
  "heartbeat",
  "autonomy mode",
  "governance score",
  "metriccount",
  "agent id",
] as const;

const STALE_MS = 24 * 60 * 60 * 1000;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ") + "…";
}

function sanitizeAssessmentSummary(summary: string): string {
  const cleaned = summary
    .replace(/\s+/g, " ")
    .replace(/readinessScore/gi, "readiness")
    .replace(/governanceRiskScore/gi, "risk score")
    .trim();
  return truncateWords(cleaned, 45);
}

function relativeSyncLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "less than an hour ago";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function isStale(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ms = Date.now() - new Date(iso).getTime();
  return !Number.isNaN(ms) && ms > STALE_MS;
}

function bandPhrase(band: HealthBand | null): string {
  switch (band) {
    case "strong":
      return "strong";
    case "steady":
      return "steady";
    case "caution":
      return "needs attention";
    case "at_risk":
      return "at risk";
    default:
      return "being established";
  }
}

function buildOnboardingNarrative(input: ComposeBriefingInput): string {
  const parts: string[] = [];
  parts.push(
    `${input.orgName} has delivery governance configured and is ready for operational intelligence.`,
  );

  const missing: string[] = [];
  if (!input.deliverySnapshot) missing.push("Jira for delivery tracking");
  if (!input.codeSnapshot) missing.push("GitHub for engineering activity");
  if (!input.observabilitySnapshot || input.observabilityIsDemo) {
    missing.push("Prometheus or Grafana for production stability");
  }

  if (missing.length > 0) {
    parts.push(
      `Connect ${missing.slice(0, 2).join(" and ")}${missing.length > 2 ? ", and observability" : ""} to unlock a full delivery confidence briefing.`,
    );
  } else {
    parts.push(
      "Sync your connected integrations to generate release and stability insights on this dashboard.",
    );
  }

  if (input.stats.pendingApprovals > 0) {
    parts.push(
      `${input.stats.pendingApprovals} release approval${input.stats.pendingApprovals === 1 ? " is" : "s are"} waiting for your decision.`,
    );
  }

  return parts.join(" ");
}

function buildProductionNarrative(input: ComposeBriefingInput, health: ExecutiveBriefing["health"]): string {
  const parts: string[] = [];
  const release = input.latestRelease;

  if (release) {
    const statusPhrase =
      release.status === "STAGED"
        ? "preparing for staging"
        : release.status === "READY"
          ? "ready for deployment review"
          : release.status === "IN_QA"
            ? "in QA"
            : release.status === "DEPLOYED"
              ? "deployed"
              : "in progress";
    parts.push(`${input.orgName} is ${statusPhrase} on ${release.name}.`);
  } else if (input.hasAssessedRelease) {
    parts.push(`${input.orgName} has assessed releases in the portfolio.`);
  } else {
    parts.push(`${input.orgName} is building its release portfolio.`);
  }

  if (health.visible && health.bandLabel) {
    parts.push(`Delivery confidence is ${bandPhrase(health.band)}.`);
  }

  const releaseDim = health.dimensions.find((d) => d.id === "release");
  if (releaseDim) {
    parts.push(releaseDim.summary);
  } else if (release?.readinessScore != null) {
    parts.push(`QA readiness is strong at ${Math.round(release.readinessScore)}%.`);
  }

  const stabilityDim = health.dimensions.find((d) => d.id === "stability");
  if (stabilityDim) {
    parts.push(stabilityDim.summary);
  } else if (input.stats.openIncidents === 0) {
    parts.push("Production stability signals are not yet connected.");
  }

  const momentumDim = health.dimensions.find((d) => d.id === "momentum");
  if (momentumDim) {
    parts.push(momentumDim.summary);
  } else if (input.activeAuthors != null && input.activeAuthors > 0) {
    const top = input.topAuthors?.[0];
    const topLine = top ? ` (top contributor: ${top.login})` : "";
    parts.push(`${input.activeAuthors} contributors active this week${topLine}.`);
  }

  if (input.assessmentSummary) {
    parts.push(sanitizeAssessmentSummary(input.assessmentSummary));
  }

  const staleSources: string[] = [];
  if (isStale(input.integrationFreshness.jiraSyncedAt)) staleSources.push("Jira");
  if (isStale(input.integrationFreshness.githubSyncedAt)) staleSources.push("GitHub");
  if (isStale(input.integrationFreshness.observabilitySyncedAt)) {
    staleSources.push("Observability");
  }
  if (staleSources.length > 0) {
    parts.push(
      `Integration data from ${staleSources.join(" and ")} is over 24 hours old.`,
    );
  }

  const jiraLabel = relativeSyncLabel(input.integrationFreshness.jiraSyncedAt);
  const githubLabel = relativeSyncLabel(input.integrationFreshness.githubSyncedAt);
  if (jiraLabel && !staleSources.includes("Jira")) {
    parts.push(`Jira data was synced ${jiraLabel}.`);
  }
  if (githubLabel && input.activeAuthors != null && !staleSources.includes("GitHub")) {
    parts.push(`GitHub activity reflects ${input.activeAuthors} contributor${input.activeAuthors === 1 ? "" : "s"} this week.`);
  }

  if (input.stats.rollbackPending > 0) {
    parts.push(
      `${input.stats.rollbackPending} deployment${input.stats.rollbackPending === 1 ? "" : "s"} may need rollback review.`,
    );
  }

  if (input.stats.pendingApprovals > 0) {
    parts.push(
      `${input.stats.pendingApprovals} release approval${input.stats.pendingApprovals === 1 ? " is" : "s are"} waiting for your decision before deploy can proceed.`,
    );
  } else if (input.stats.openIncidents > 0) {
    parts.push(
      `Review ${input.stats.openIncidents} open incident${input.stats.openIncidents === 1 ? "" : "s"} before the next release.`,
    );
  }

  return parts.join(" ");
}

function buildClaims(input: ComposeBriefingInput, health: ExecutiveBriefing["health"]): BriefingClaim[] {
  const claims: BriefingClaim[] = [];
  const release = input.latestRelease;

  if (release) {
    const facts: string[] = [];
    if (release.readinessScore != null) {
      facts.push(`QA readiness ${Math.round(release.readinessScore)}%`);
    }
    if (release.governanceRiskScore != null) {
      facts.push(`Governance risk ${Math.round(release.governanceRiskScore)}%`);
    }
    facts.push(`Status: ${release.status.replace(/_/g, " ").toLowerCase()}`);
    claims.push({
      id: "release",
      headline: release.name,
      facts,
      href: `/releases/${release.id}`,
      severity: release.status === "BLOCKED" ? "critical" : "info",
    });
  }

  const momentumDim = health.dimensions.find((d) => d.id === "momentum");
  if (momentumDim && input.deliverySnapshot) {
    const { blocked, overdue, resolvedLast7d } = input.deliverySnapshot.kpis;
    claims.push({
      id: "momentum",
      headline: momentumDim.summary.replace(/\.$/, ""),
      facts: [
        resolvedLast7d != null ? `${resolvedLast7d} resolved last 7d` : "Delivery data synced",
        blocked > 0 ? `${blocked} blocked` : "No blockers",
        overdue > 0 ? `${overdue} overdue` : "Schedule on track",
      ],
      href: "/delivery-analysis",
      severity: blocked > 0 || overdue > 0 ? "warning" : "info",
    });
  }

  if (input.activeAuthors != null && input.activeAuthors > 0) {
    const facts =
      input.topAuthors?.slice(0, 2).map((a) => `${a.login} (${a.commits} commits)`) ?? [
        `${input.activeAuthors} active contributors`,
      ];
    claims.push({
      id: "engineering",
      headline: `${input.activeAuthors} contributors active`,
      facts,
      href: "/code-analysis",
    });
  }

  const stabilityDim = health.dimensions.find((d) => d.id === "stability");
  if (stabilityDim) {
    claims.push({
      id: "stability",
      headline: stabilityDim.summary.replace(/\.$/, ""),
      facts: [
        input.stats.openIncidents === 0
          ? "No open incidents"
          : `${input.stats.openIncidents} open incidents`,
        input.stats.degradedDeployments > 0
          ? `${input.stats.degradedDeployments} degraded deployments`
          : "Deployments healthy",
      ],
      href: input.stats.openIncidents > 0 ? "/incidents" : "/observability",
      severity:
        input.stats.openIncidents > 0
          ? "critical"
          : input.stats.degradedDeployments > 0
            ? "warning"
            : "info",
    });
  }

  if (input.stats.pendingApprovals > 0) {
    claims.push({
      id: "approvals",
      headline: `${input.stats.pendingApprovals} approval${input.stats.pendingApprovals === 1 ? "" : "s"} waiting`,
      facts: ["Release manager sign-off required before deploy"],
      href: "/approvals",
      severity: "warning",
    });
  }

  if (input.stats.rollbackPending > 0) {
    claims.push({
      id: "rollback",
      headline: "Rollback review recommended",
      facts: [`${input.stats.rollbackPending} deployment(s) flagged`],
      href: "/devops",
      severity: "critical",
    });
  }

  return claims.slice(0, 5);
}

function resolvePrimaryCta(
  input: ComposeBriefingInput,
): ExecutiveBriefing["primaryCta"] | undefined {
  if (input.stats.pendingApprovals > 0) {
    const n = input.stats.pendingApprovals;
    return {
      label: n === 1 ? "Review 1 pending approval" : `Review ${n} pending approvals`,
      href: "/approvals",
    };
  }
  if (input.stats.rollbackPending > 0) {
    return {
      label: "Review rollback recommendation",
      href: "/devops",
    };
  }
  if (input.stats.openIncidents > 0) {
    return {
      label:
        input.stats.openIncidents === 1
          ? "Review open incident"
          : `Review ${input.stats.openIncidents} open incidents`,
      href: "/incidents",
    };
  }
  return undefined;
}

function resolveFreshness(input: ComposeBriefingInput): ExecutiveBriefing["freshness"] {
  const timestamps = [
    input.integrationFreshness.jiraSyncedAt,
    input.integrationFreshness.githubSyncedAt,
    input.integrationFreshness.observabilitySyncedAt,
  ].filter((t): t is string => Boolean(t));

  const asOf =
    timestamps.length > 0
      ? timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]!
      : new Date().toISOString();

  const staleSources: string[] = [];
  if (isStale(input.integrationFreshness.jiraSyncedAt)) staleSources.push("Jira");
  if (isStale(input.integrationFreshness.githubSyncedAt)) staleSources.push("GitHub");
  if (isStale(input.integrationFreshness.observabilitySyncedAt)) {
    staleSources.push("Observability");
  }

  return {
    asOf,
    stale: staleSources.length > 0,
    staleSources,
  };
}

/** Deterministic L1 narrative and L2 claims from structured org facts. */
export function composeExecutiveBriefing(input: ComposeBriefingInput): ExecutiveBriefing {
  const health = computeDeliveryHealthScore(input);

  const narrativeRaw = health.visible
    ? buildProductionNarrative(input, health)
    : buildOnboardingNarrative(input);

  const narrative = truncateWords(narrativeRaw, 180);
  const wordCount = countWords(narrative);

  const briefing: ExecutiveBriefing = {
    narrative,
    wordCount,
    health,
    claims: buildClaims(input, health),
    primaryCta: resolvePrimaryCta(input),
    freshness: resolveFreshness(input),
    source: "deterministic",
  };

  return briefing;
}

export function assertNoBannedL1Terms(narrative: string): void {
  const lower = narrative.toLowerCase();
  for (const term of BANNED_L1_TERMS) {
    if (lower.includes(term)) {
      throw new Error(`Banned L1 term found: ${term}`);
    }
  }
}

export type { DeliveryAnalysisSnapshot, CodeAnalysisSnapshot };
