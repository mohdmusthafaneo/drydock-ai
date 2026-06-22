import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import type { getOrganizationContext } from "@/lib/org-data";
import { scoreToBand } from "@/lib/executive-briefing/health-score";

export type LeadershipDecision = {
  id: string;
  title: string;
  context: string;
  urgency: "critical" | "attention";
  href: string;
  actionLabel: string;
};

export type ReleasePortfolioItem = {
  id: string;
  name: string;
  phase: string;
  readiness: number | null;
  risk: number | null;
  href: string;
  tone: "good" | "attention" | "risk" | "neutral";
};

export type TeamDrillDown = {
  id: string;
  audience: string;
  title: string;
  summary: string;
  href: string;
};

export type ExecutiveDeck = {
  decisions: LeadershipDecision[];
  portfolio: ReleasePortfolioItem[];
  blindSpots: string[];
  teamLinks: TeamDrillDown[];
};

type Ctx = Awaited<ReturnType<typeof getOrganizationContext>>;

function releasePhase(status: string): string {
  switch (status) {
    case "STAGED":
      return "Preparing to ship";
    case "READY":
      return "Ready for approval";
    case "IN_QA":
      return "In QA";
    case "DEPLOYED":
      return "Live in production";
    case "BLOCKED":
      return "Blocked";
    default:
      return "In progress";
  }
}

function portfolioTone(
  status: string,
  readiness: number | null,
  risk: number | null,
): ReleasePortfolioItem["tone"] {
  if (status === "BLOCKED") return "risk";
  if (status === "DEPLOYED") return "good";
  if (risk != null && risk >= 50) return "risk";
  if (readiness != null && readiness < 60) return "attention";
  if (readiness != null && readiness >= 75) return "good";
  return "neutral";
}

function buildDecisions(briefing: ExecutiveBriefing, ctx: Ctx): LeadershipDecision[] {
  const decisions: LeadershipDecision[] = [];

  if (ctx.stats.pendingApprovals > 0) {
    const pending = ctx.approvals.filter((a) => !a.decision);
    const releaseIds = new Set(
      pending
        .map((a) => a.recommendation?.releaseId)
        .filter((id): id is string => Boolean(id)),
    );
    const releaseNames = ctx.releases
      .filter((r) => releaseIds.has(r.id))
      .map((r) => r.name);
    const releaseLine =
      releaseNames.length === 1
        ? releaseNames[0]!
        : releaseNames.length > 1
          ? `${releaseNames.length} releases`
          : "the next release";

    decisions.push({
      id: "approvals",
      title: `${ctx.stats.pendingApprovals} release approval${ctx.stats.pendingApprovals === 1 ? "" : "s"} waiting`,
      context: `Your sign-off is required before ${releaseLine} can deploy.`,
      urgency: "attention",
      href: "/approvals",
      actionLabel: "Review approvals",
    });
  }

  if (ctx.stats.rollbackPending > 0) {
    decisions.push({
      id: "rollback",
      title: "Rollback under review",
      context: `${ctx.stats.rollbackPending} deployment${ctx.stats.rollbackPending === 1 ? "" : "s"} may need to be reversed — confirm with your engineering lead.`,
      urgency: "critical",
      href: "/devops",
      actionLabel: "Review deployment health",
    });
  }

  if (ctx.stats.openIncidents > 0) {
    const latest = ctx.incidents.find(
      (i) => i.status === "OPEN" || i.status === "INVESTIGATING",
    );
    decisions.push({
      id: "incidents",
      title: `${ctx.stats.openIncidents} production incident${ctx.stats.openIncidents === 1 ? "" : "s"} open`,
      context: latest
        ? `${latest.title} — assess customer impact before the next release.`
        : "Production stability needs executive awareness before shipping.",
      urgency: "critical",
      href: "/incidents",
      actionLabel: "View incidents",
    });
  }

  if (briefing.freshness.stale && briefing.freshness.staleSources.length > 0) {
    decisions.push({
      id: "stale-data",
      title: "Briefing data may be outdated",
      context: `${briefing.freshness.staleSources.join(" and ")} last synced over 24 hours ago — decisions should wait for a fresh sync.`,
      urgency: "attention",
      href: "/integrations",
      actionLabel: "Refresh integrations",
    });
  }

  return decisions;
}

function buildPortfolio(ctx: Ctx): ReleasePortfolioItem[] {
  const active = ctx.releases.filter((r) => r.status !== "DEPLOYED").slice(0, 4);
  const recentLive = ctx.releases
    .filter((r) => r.status === "DEPLOYED")
    .slice(0, 1);

  const items = [...active, ...recentLive].slice(0, 4);

  return items.map((release) => ({
    id: release.id,
    name: release.name,
    phase: releasePhase(release.status),
    readiness: release.readinessScore,
    risk: release.governanceRiskScore,
    href: `/releases/${release.id}`,
    tone: portfolioTone(
      release.status,
      release.readinessScore,
      release.governanceRiskScore,
    ),
  }));
}

function buildBlindSpots(briefing: ExecutiveBriefing): string[] {
  const spots = [...briefing.health.dataGaps];
  if (briefing.freshness.stale && briefing.freshness.staleSources.length > 0) {
    const staleNote = `${briefing.freshness.staleSources.join(", ")} data is stale`;
    if (!spots.some((s) => s.toLowerCase().includes("stale"))) {
      spots.push(staleNote);
    }
  }
  return [...new Set(spots)];
}

function buildTeamLinks(
  briefing: ExecutiveBriefing,
  ctx: Ctx,
  hasDelivery: boolean,
  hasEngineering: boolean,
  hasObservability: boolean,
): TeamDrillDown[] {
  const links: TeamDrillDown[] = [];

  if (hasDelivery) {
    const blocked = briefing.claims.find((c) => c.id === "delivery");
    links.push({
      id: "delivery",
      audience: "Delivery lead",
      title: "Backlog & sprint detail",
      summary: blocked?.context ?? "Ticket flow, blockers, and sprint progress",
      href: "/delivery-analysis",
    });
  }

  if (hasEngineering) {
    links.push({
      id: "engineering",
      audience: "Engineering lead",
      title: "Code & contributor activity",
      summary: "Commit velocity, AI-assisted changes, and repo health",
      href: "/code-analysis",
    });
  }

  if (hasObservability || ctx.stats.openIncidents > 0) {
    links.push({
      id: "stability",
      audience: "Platform / SRE lead",
      title: "Production signals",
      summary:
        ctx.stats.openIncidents > 0
          ? `${ctx.stats.openIncidents} open incident${ctx.stats.openIncidents === 1 ? "" : "s"} and service health`
          : "Latency, errors, and deployment health",
      href: ctx.stats.openIncidents > 0 ? "/incidents" : "/observability",
    });
  }

  if (ctx.releases.length > 0) {
    links.push({
      id: "releases",
      audience: "Release manager",
      title: "Release governance detail",
      summary: "QA gates, risk scores, and approval workflows",
      href: "/releases",
    });
  }

  return links;
}

export function composeExecutiveDeck(input: {
  briefing: ExecutiveBriefing;
  ctx: Ctx;
  hasDelivery: boolean;
  hasEngineering: boolean;
  hasObservability: boolean;
}): ExecutiveDeck {
  return {
    decisions: buildDecisions(input.briefing, input.ctx),
    portfolio: buildPortfolio(input.ctx),
    blindSpots: buildBlindSpots(input.briefing),
    teamLinks: buildTeamLinks(
      input.briefing,
      input.ctx,
      input.hasDelivery,
      input.hasEngineering,
      input.hasObservability,
    ),
  };
}

export function dimensionBandLabel(score: number): string {
  const band = scoreToBand(score);
  switch (band) {
    case "strong":
      return "Strong";
    case "steady":
      return "Steady";
    case "caution":
      return "Needs attention";
    case "at_risk":
      return "At risk";
  }
}
