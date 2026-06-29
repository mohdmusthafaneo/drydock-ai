import { computeDeliveryHealthScore } from "@/lib/executive-briefing/health-score";
import type {
  BriefingClaim,
  BriefingClaimVerdict,
  BriefingHighlight,
  BriefingInsight,
  ExecutiveBriefing,
  HeadlineSegment,
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

function flattenHeadline(segments: HeadlineSegment[]): string {
  return segments.map((s) => s.text).join("");
}

function relativeSyncLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isStale(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ms = Date.now() - new Date(iso).getTime();
  return !Number.isNaN(ms) && ms > STALE_MS;
}

function bandPhrase(band: HealthBand | null): string {
  switch (band) {
    case "strong":
      return "looking strong";
    case "steady":
      return "holding steady";
    case "caution":
      return "needs attention";
    case "at_risk":
      return "at risk";
    default:
      return "being established";
  }
}

function releaseStatusPhrase(status: string): string {
  switch (status) {
    case "STAGED":
      return "preparing for staging";
    case "READY":
      return "ready for review";
    case "IN_QA":
      return "in QA";
    case "DEPLOYED":
      return "live in production";
    case "BLOCKED":
      return "blocked";
    default:
      return "in progress";
  }
}

function connectedSourceNames(input: ComposeBriefingInput): string[] {
  const sources: string[] = [];
  if (input.deliverySnapshot) sources.push("Jira");
  if (input.codeSnapshot) sources.push("GitHub");
  if (input.observabilitySnapshot && !input.observabilityIsDemo) {
    sources.push("observability");
  }
  return sources;
}

function buildMetaLine(input: ComposeBriefingInput): string {
  const timestamps = [
    input.integrationFreshness.jiraSyncedAt,
    input.integrationFreshness.githubSyncedAt,
    input.integrationFreshness.observabilitySyncedAt,
  ].filter((t): t is string => Boolean(t));

  const freshest =
    timestamps.length > 0
      ? timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]!
      : null;

  const syncLabel = relativeSyncLabel(freshest);
  const sources = connectedSourceNames(input);

  if (syncLabel && sources.length > 0) {
    const sourceList =
      sources.length === 1
        ? sources[0]!
        : sources.length === 2
          ? `${sources[0]} and ${sources[1]}`
          : `${sources.slice(0, -1).join(", ")}, and ${sources[sources.length - 1]}`;
    return `Updated ${syncLabel} · drawn from ${sourceList}`;
  }

  if (sources.length > 0) {
    return `Drawn from ${sources.join(", ")}`;
  }

  return "Connect integrations to keep this briefing current";
}

function buildOnboardingHeadline(input: ComposeBriefingInput): HeadlineSegment[] {
  const missing: string[] = [];
  if (!input.deliverySnapshot) missing.push("Jira");
  if (!input.codeSnapshot) missing.push("GitHub");
  if (!input.observabilitySnapshot || input.observabilityIsDemo) {
    missing.push("observability");
  }

  if (missing.length > 0) {
    const tools =
      missing.length === 1
        ? missing[0]!
        : missing.length === 2
          ? `${missing[0]} and ${missing[1]}`
          : `${missing[0]}, ${missing[1]}, and observability`;
    return [
      { kind: "text", text: `${input.orgName} is set up — connect ` },
      { kind: "emphasis", text: tools },
      { kind: "text", text: " to unlock your delivery briefing." },
    ];
  }

  return [
    { kind: "text", text: `${input.orgName} is ready — sync your integrations to see release and stability signals.` },
  ];
}

function buildProductionHeadline(
  input: ComposeBriefingInput,
  health: ExecutiveBriefing["health"],
): HeadlineSegment[] {
  const release = input.latestRelease;

  if (input.stats.pendingApprovals > 0) {
    const n = input.stats.pendingApprovals;
    const releaseName = release?.name ?? "the next release";
    return [
      { kind: "emphasis", text: String(n) },
      {
        kind: "text",
        text: ` approval${n === 1 ? "" : "s"} waiting before `,
      },
      { kind: "emphasis", text: releaseName },
      { kind: "text", text: " can ship." },
    ];
  }

  if (input.stats.rollbackPending > 0) {
    const n = input.stats.rollbackPending;
    return [
      { kind: "emphasis", text: String(n) },
      {
        kind: "text",
        text: ` deployment${n === 1 ? "" : "s"} flagged for rollback review.`,
      },
    ];
  }

  if (input.stats.openIncidents > 0) {
    const n = input.stats.openIncidents;
    return [
      { kind: "emphasis", text: String(n) },
      {
        kind: "text",
        text: ` open incident${n === 1 ? "" : "s"} — review before the next release.`,
      },
    ];
  }

  if (release) {
    const status = releaseStatusPhrase(release.status);
    const segments: HeadlineSegment[] = [
      { kind: "text", text: `${input.orgName} is ${status} on ` },
      { kind: "emphasis", text: release.name },
    ];

    if (release.readinessScore != null) {
      segments.push(
        { kind: "text", text: " — " },
        { kind: "emphasis", text: `${Math.round(release.readinessScore)}%` },
        { kind: "text", text: " ready to ship" },
      );
    }

    if (health.visible && health.band) {
      segments.push({ kind: "text", text: `, delivery ${bandPhrase(health.band)}.` });
    } else {
      segments.push({ kind: "text", text: "." });
    }

    return segments;
  }

  if (health.visible && health.overall != null) {
    return [
      { kind: "text", text: `${input.orgName} delivery is ` },
      { kind: "emphasis", text: bandPhrase(health.band) },
      { kind: "text", text: ` at ` },
      { kind: "emphasis", text: String(health.overall) },
      { kind: "text", text: " confidence." },
    ];
  }

  return [
    { kind: "text", text: `${input.orgName} is building its release portfolio.` },
  ];
}

function buildInsight(
  input: ComposeBriefingInput,
  health: ExecutiveBriefing["health"],
): BriefingInsight | undefined {
  if (input.stats.pendingApprovals > 0) {
    return {
      tone: "attention",
      message: `${input.stats.pendingApprovals} release approval${input.stats.pendingApprovals === 1 ? "" : "s"} need your sign-off before deploy.`,
      href: "/approvals",
    };
  }

  if (input.stats.rollbackPending > 0) {
    return {
      tone: "critical",
      message: "A deployment may need rollback — review the recommendation before the next release.",
      href: "/devops",
    };
  }

  if (input.stats.openIncidents > 0) {
    return {
      tone: "critical",
      message: `${input.stats.openIncidents} production incident${input.stats.openIncidents === 1 ? " is" : "s are"} open — triage before shipping.`,
      href: "/incidents",
    };
  }

  const staleSources: string[] = [];
  if (isStale(input.integrationFreshness.jiraSyncedAt)) staleSources.push("Jira");
  if (isStale(input.integrationFreshness.githubSyncedAt)) staleSources.push("GitHub");
  if (isStale(input.integrationFreshness.observabilitySyncedAt)) {
    staleSources.push("observability");
  }
  if (staleSources.length > 0) {
    return {
      tone: "attention",
      message: `${staleSources.join(" and ")} data is over a day old — re-sync for current signals.`,
      href: "/integrations",
    };
  }

  if (input.jiraHygiene?.degradesTrust) {
    const project = input.jiraHygiene.worstProject;
    const projectLabel = project ? `Project ${project.key}'s Jira` : "Jira boards";
    return {
      tone: "attention",
      message: `${projectLabel} is not maintained per the agreed workflow — discount delivery numbers until hygiene improves.`,
      href: "/delivery-analysis",
    };
  }

  const momentum = input.deliverySnapshot?.kpis;
  if (momentum && momentum.blocked > 0) {
    return {
      tone: "attention",
      message: `${momentum.blocked} blocked item${momentum.blocked === 1 ? "" : "s"} in Jira — clear blockers to keep the release on track.`,
      href: "/delivery-analysis",
    };
  }

  if (momentum && momentum.overdue > 0) {
    return {
      tone: "attention",
      message: `${momentum.overdue} overdue item${momentum.overdue === 1 ? "" : "s"} — review schedule risk before deploy.`,
      href: "/delivery-analysis",
    };
  }

  if (health.visible && health.band === "strong" && momentum?.resolvedLast7d) {
    return {
      tone: "info",
      message: `Steady week — ${momentum.resolvedLast7d} tickets closed with no open blockers.`,
      href: "/delivery-analysis",
    };
  }

  return undefined;
}

function buildHighlights(
  input: ComposeBriefingInput,
  health: ExecutiveBriefing["health"],
): BriefingHighlight[] {
  const highlights: BriefingHighlight[] = [];
  const release = input.latestRelease;

  if (health.visible && health.overall != null && health.bandLabel) {
    highlights.push({
      id: "confidence",
      label: "Delivery confidence",
      value: String(health.overall),
      subtext: health.bandLabel,
      href: "/dashboard#breakdown",
      tone:
        health.band === "strong"
          ? "good"
          : health.band === "at_risk"
            ? "risk"
            : health.band === "caution"
              ? "attention"
              : "neutral",
    });
  }

  if (release?.readinessScore != null) {
    highlights.push({
      id: "readiness",
      label: "Ready to ship",
      value: `${Math.round(release.readinessScore)}%`,
      subtext: release.name,
      href: `/releases/${release.id}`,
      tone: release.readinessScore >= 75 ? "good" : release.readinessScore >= 50 ? "attention" : "risk",
    });
  }

  const momentum = input.deliverySnapshot?.kpis;
  if (momentum) {
    if (momentum.resolvedLast7d != null && momentum.resolvedLast7d > 0) {
      highlights.push({
        id: "momentum",
        label: "This week",
        value: String(momentum.resolvedLast7d),
        subtext: "tickets closed",
        href: "/delivery-analysis",
        tone: "good",
      });
    } else if (momentum.openWork != null) {
      highlights.push({
        id: "momentum",
        label: "Open work",
        value: String(momentum.openWork),
        subtext: momentum.blocked > 0 ? `${momentum.blocked} blocked` : "in Jira",
        href: "/delivery-analysis",
        tone: momentum.blocked > 0 ? "attention" : "neutral",
      });
    }
  } else if (input.activeAuthors != null && input.activeAuthors > 0) {
    highlights.push({
      id: "engineering",
      label: "Contributors",
      value: String(input.activeAuthors),
      subtext: "active this week",
      href: "/code-analysis",
      tone: "neutral",
    });
  }

  if (input.observabilitySnapshot && !input.observabilityIsDemo) {
    const incidents = input.stats.openIncidents;
    highlights.push({
      id: "stability",
      label: "Production",
      value: incidents === 0 ? "Clear" : String(incidents),
      subtext: incidents === 0 ? "no open incidents" : `incident${incidents === 1 ? "" : "s"} open`,
      href: incidents > 0 ? "/incidents" : "/observability",
      tone: incidents === 0 ? "good" : "risk",
    });
  } else if (input.stats.pendingApprovals > 0) {
    highlights.push({
      id: "approvals",
      label: "Approvals",
      value: String(input.stats.pendingApprovals),
      subtext: "waiting for you",
      href: "/approvals",
      tone: "attention",
    });
  }

  return highlights.slice(0, 4);
}

function releaseVerdict(
  status: string,
  readiness: number | null | undefined,
  risk: number | null | undefined,
): { verdict: BriefingClaimVerdict; verdictLabel: string } {
  if (status === "BLOCKED") {
    return { verdict: "risk", verdictLabel: "Blocked" };
  }
  if (status === "DEPLOYED") {
    return { verdict: "good", verdictLabel: "Live" };
  }
  if (readiness != null && readiness >= 80 && (risk == null || risk < 35)) {
    return { verdict: "good", verdictLabel: "On track" };
  }
  if (readiness != null && readiness >= 60) {
    return { verdict: "attention", verdictLabel: "Needs review" };
  }
  if (risk != null && risk >= 50) {
    return { verdict: "risk", verdictLabel: "High risk" };
  }
  if (readiness != null && readiness < 60) {
    return { verdict: "risk", verdictLabel: "Not ready" };
  }
  return { verdict: "neutral", verdictLabel: releaseStatusPhrase(status) };
}

function deliveryVerdict(blocked: number, overdue: number): {
  verdict: BriefingClaimVerdict;
  verdictLabel: string;
} {
  if (blocked > 0) {
    return { verdict: "risk", verdictLabel: `${blocked} blocked` };
  }
  if (overdue > 0) {
    return { verdict: "attention", verdictLabel: `${overdue} overdue` };
  }
  return { verdict: "good", verdictLabel: "On schedule" };
}

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildClaims(input: ComposeBriefingInput, health: ExecutiveBriefing["health"]): BriefingClaim[] {
  const claims: BriefingClaim[] = [];
  const release = input.latestRelease;

  if (release) {
    const readiness = release.readinessScore;
    const risk = release.governanceRiskScore;
    const { verdict, verdictLabel } = releaseVerdict(release.status, readiness, risk);
    const statusLine = releaseStatusPhrase(release.status);
    const riskLine = risk != null ? `Governance risk ${Math.round(risk)}%` : null;
    const context =
      riskLine && statusLine !== verdictLabel
        ? `${statusLine} · ${riskLine}`
        : riskLine ?? statusLine;

    claims.push({
      id: "release",
      headline: release.name,
      metric: readiness != null ? `${Math.round(readiness)}%` : undefined,
      metricLabel: readiness != null ? "Ready to ship" : undefined,
      verdict,
      verdictLabel,
      context: capitalizeFirst(context),
      href: `/releases/${release.id}`,
    });
  }

  if (input.deliverySnapshot) {
    const { blocked, overdue, resolvedLast7d, openWork } = input.deliverySnapshot.kpis;
    const { verdict, verdictLabel } = deliveryVerdict(blocked, overdue);
    const closed = resolvedLast7d ?? 0;
    const open = openWork ?? 0;

    let context: string;
    if (blocked > 0 && overdue > 0) {
      context = `${blocked} waiting on dependencies · ${overdue} past due`;
    } else if (blocked > 0) {
      context = `${blocked} item${blocked === 1 ? "" : "s"} waiting on dependencies`;
    } else if (overdue > 0) {
      context = `${overdue} item${overdue === 1 ? "" : "s"} past due`;
    } else if (closed > 0) {
      context = `${open.toLocaleString()} still open · pace is healthy`;
    } else {
      context = `${open.toLocaleString()} open item${open === 1 ? "" : "s"} in flight`;
    }

    claims.push({
      id: "delivery",
      headline: "Delivery pace",
      metric: closed > 0 ? String(closed) : open > 0 ? open.toLocaleString() : "0",
      metricLabel: closed > 0 ? "Closed this week" : "Open items",
      verdict,
      verdictLabel,
      context: capitalizeFirst(context),
      href: "/delivery-analysis",
    });
  }

  const stabilityDim = health.dimensions.find((d) => d.id === "stability");
  if (stabilityDim) {
    const incidents = input.stats.openIncidents;
    const degraded = input.stats.degradedDeployments;
    const healthScore = Math.round(stabilityDim.score);

    let verdict: BriefingClaimVerdict;
    let verdictLabel: string;
    let context: string;

    if (incidents > 0) {
      verdict = "risk";
      verdictLabel = `${incidents} incident${incidents === 1 ? "" : "s"}`;
      context =
        degraded > 0
          ? `${degraded} degraded deployment${degraded === 1 ? "" : "s"} need review`
          : "Production needs immediate attention";
    } else if (degraded > 0) {
      verdict = "attention";
      verdictLabel = "Degraded";
      context = `${degraded} deployment${degraded === 1 ? "" : "s"} below target health`;
    } else {
      verdict = "good";
      verdictLabel = "Stable";
      context = "No open incidents · deployments healthy";
    }

    claims.push({
      id: "stability",
      headline: incidents > 0 ? "Production alert" : "Production",
      metric: incidents > 0 ? String(incidents) : String(healthScore),
      metricLabel: incidents > 0 ? "Open incidents" : "Health score",
      verdict,
      verdictLabel,
      context: capitalizeFirst(context),
      href: incidents > 0 ? "/incidents" : "/observability",
    });
  }

  if (input.stats.pendingApprovals > 0) {
    const n = input.stats.pendingApprovals;
    claims.push({
      id: "approvals",
      headline: "Release approvals",
      metric: String(n),
      metricLabel: "Waiting on you",
      verdict: "attention",
      verdictLabel: "Action needed",
      context: "Sign-off required before the next deploy",
      href: "/approvals",
    });
  }

  if (input.stats.rollbackPending > 0) {
    const n = input.stats.rollbackPending;
    claims.push({
      id: "rollback",
      headline: "Rollback review",
      metric: String(n),
      metricLabel: "Deployments flagged",
      verdict: "risk",
      verdictLabel: "Review now",
      context: "Rollback may be required — check deployment health",
      href: "/devops",
    });
  }

  const governanceDim = health.dimensions.find((d) => d.id === "governance");
  if (governanceDim && !claims.some((c) => c.id === "governance")) {
    const staleSources: string[] = [];
    if (isStale(input.integrationFreshness.jiraSyncedAt)) staleSources.push("Jira");
    if (isStale(input.integrationFreshness.githubSyncedAt)) staleSources.push("GitHub");
    if (isStale(input.integrationFreshness.observabilitySyncedAt)) {
      staleSources.push("Observability");
    }

    const score = Math.round(governanceDim.score);
    const unhealthy = input.stats.connectedTools - input.stats.integrationsHealthy;

    let verdict: BriefingClaimVerdict;
    let verdictLabel: string;
    let context: string;

    if (staleSources.length > 0) {
      verdict = "attention";
      verdictLabel = "Data stale";
      const list =
        staleSources.length === 1
          ? staleSources[0]!
          : staleSources.length === 2
            ? `${staleSources[0]} and ${staleSources[1]}`
            : `${staleSources.slice(0, -1).join(", ")}, and ${staleSources[staleSources.length - 1]}`;
      context = `${list} last synced over 24 hours ago — re-sync before deciding`;
    } else if (input.jiraHygiene?.degradesTrust) {
      const project = input.jiraHygiene.worstProject;
      verdict = input.jiraHygiene.portfolioScore < 40 ? "risk" : "attention";
      verdictLabel = "Low Jira trust";
      context = project
        ? `Project ${project.key}'s Jira is not maintained per the agreed workflow — delivery numbers may be unreliable`
        : "Jira boards are not maintained per the agreed workflow — delivery numbers may be unreliable";
    } else if (input.stats.connectedTools === 0) {
      verdict = "attention";
      verdictLabel = "Not connected";
      context = "Connect Jira, GitHub, and observability to trust this briefing";
    } else if (unhealthy > 0) {
      verdict = "attention";
      verdictLabel = `${unhealthy} unhealthy`;
      context = `${input.stats.integrationsHealthy} of ${input.stats.connectedTools} integrations reporting clean data`;
    } else {
      verdict = score >= 75 ? "good" : score >= 50 ? "attention" : "risk";
      verdictLabel = score >= 75 ? "Trusted" : score >= 50 ? "Fair" : "Low trust";
      context = `${input.stats.integrationsHealthy} of ${input.stats.connectedTools} integrations healthy · briefing data is current`;
    }

    claims.push({
      id: "governance",
      headline: "Data confidence",
      metric: String(score),
      metricLabel: "Trust score",
      verdict,
      verdictLabel,
      context: capitalizeFirst(context),
      href: "/integrations",
    });
  }

  return claims.slice(0, 4);
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

  const headline = health.visible
    ? buildProductionHeadline(input, health)
    : buildOnboardingHeadline(input);

  const narrative = flattenHeadline(headline);
  const wordCount = countWords(narrative);

  const briefing: ExecutiveBriefing = {
    headline,
    meta: buildMetaLine(input),
    insight: buildInsight(input, health),
    highlights: buildHighlights(input, health),
    narrative,
    wordCount,
    health,
    claims: buildClaims(input, health),
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
