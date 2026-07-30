import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import type { getOrganizationContext } from "@/lib/org-data";
import type { DeliveryAnalysisSnapshot, DeliveryAnalysisSprintRow, DeliveryAnalysisVersionRow } from "@/lib/delivery-analysis/types";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";
import type { AgentDecision } from "@/lib/agent-analysis/types";
import { filterPortfolioReleases } from "@/lib/release-source";
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

function mapAgentDecision(decision: AgentDecision): LeadershipDecision {
  return {
    id: decision.id,
    title: decision.title,
    context: decision.detail,
    urgency: decision.tone === "risk" ? "critical" : "attention",
    href: decision.href ?? "/dashboard",
    actionLabel: decision.ctaLabel ?? "Review",
  };
}

export function buildDecisions(
  briefing: ExecutiveBriefing,
  ctx: Ctx,
  agentLeadershipDecisions: AgentDecision[] = [],
): LeadershipDecision[] {
  const decisions: LeadershipDecision[] = [];

  if (ctx.stats.pendingApprovals > 0) {
    const pending = ctx.approvals.filter((a) => {
      if (a.decision) return false;
      const title = a.title ?? a.recommendation?.title ?? "";
      return !(
        title.startsWith("[qa-blocked:") ||
        title.startsWith("[qa-board:") ||
        title.startsWith("[cloud:")
      );
    });
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

  for (const agentDecision of agentLeadershipDecisions) {
    // Deck already emits rollback from ctx.stats.rollbackPending.
    if (agentDecision.id === "devops-rollback") continue;
    decisions.push(mapAgentDecision(agentDecision));
  }

  return decisions;
}

function sprintPortfolioTone(
  sprint: DeliveryAnalysisSprintRow,
): ReleasePortfolioItem["tone"] {
  const overdue = sprint.endDate && new Date(sprint.endDate) < new Date();
  if (overdue) return "risk";
  if (sprint.pct >= 75) return "good";
  if (sprint.pct >= 50) return "attention";
  return "risk";
}

function sprintPhase(sprint: DeliveryAnalysisSprintRow): string {
  const overdue = sprint.endDate && new Date(sprint.endDate) < new Date();
  if (overdue) return "Overdue — active sprint";
  if (sprint.state === "active") return "Active sprint";
  if (sprint.state === "closed") return "Sprint closed";
  return "Sprint in progress";
}

function sprintToPortfolioItem(
  sprint: DeliveryAnalysisSprintRow,
  releaseId?: string,
): ReleasePortfolioItem {
  return {
    id: releaseId ?? `sprint-${sprint.sprintId ?? sprint.name}`,
    name: sprint.name,
    phase: sprintPhase(sprint),
    readiness: sprint.pct,
    risk: null,
    href: releaseId ? `/releases/${releaseId}` : (sprint.jiraUrl ?? "/delivery-analysis"),
    tone: sprintPortfolioTone(sprint),
  };
}

function fixVersionToPortfolioItem(
  version: DeliveryAnalysisVersionRow,
  releaseId?: string,
): ReleasePortfolioItem {
  const openCount = version.openIssuesInVersion ?? 0;
  const readiness =
    openCount === 0 ? 100 : openCount <= 5 ? 80 : openCount <= 15 ? 55 : 30;
  return {
    id: releaseId ?? `fv-${version.id}`,
    name: version.name,
    phase: version.overdue ? "Overdue fix version" : version.released ? "Released" : "Open fix version",
    readiness,
    risk: version.overdue ? 65 : openCount > 10 ? 50 : 25,
    href: releaseId ? `/releases/${releaseId}` : (version.jiraUrl ?? "/delivery-analysis"),
    tone: version.overdue ? "risk" : readiness >= 75 ? "good" : readiness >= 50 ? "attention" : "risk",
  };
}

function buildPortfolio(
  ctx: Ctx,
  deliverySnapshot?: DeliveryAnalysisSnapshot | null,
  mapping?: ToolchainMapping | null,
  briefing?: ExecutiveBriefing,
): ReleasePortfolioItem[] {
  const tracking = mapping?.jira?.releaseTracking ?? "fixVersion";
  let items: ReleasePortfolioItem[] = [];

  if (tracking === "sprint" && deliverySnapshot?.sprints?.length) {
    const sprintReleases = ctx.releases.filter((r) => r.jiraSprintId != null);
    items = deliverySnapshot.sprints.slice(0, 4).map((sprint) => {
      const linked = sprintReleases.find((r) => r.jiraSprintId === sprint.sprintId);
      return sprintToPortfolioItem(sprint, linked?.id);
    });
  } else if (tracking === "fixVersion" && deliverySnapshot?.versions?.length) {
    const fvReleases = ctx.releases.filter((r) => r.jiraFixVersion != null);
    const openVersions = deliverySnapshot.versions.filter((v) => !v.released);
    items = openVersions.slice(0, 4).map((version) => {
      const linked = fvReleases.find(
        (r) =>
          r.jiraFixVersion === version.name &&
          (r.serviceScope == null || r.serviceScope === version.projectKey),
      );
      return fixVersionToPortfolioItem(version, linked?.id);
    });
  } else {
    const portfolioReleases = filterPortfolioReleases(ctx.releases);
    const active = portfolioReleases.filter((r) => r.status !== "DEPLOYED").slice(0, 4);
    const recentLive = portfolioReleases
      .filter((r) => r.status === "DEPLOYED")
      .slice(0, 1);

    items = [...active, ...recentLive].slice(0, 4).map((release) => ({
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

  // A single portfolio row that duplicates the release claim adds no executive value.
  if (items.length === 1 && briefing?.claims.some((c) => c.id === "release")) {
    return [];
  }

  return items;
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

const AGENT_TEAM_LINKS: Array<{
  claimId: string;
  id: string;
  audience: string;
  title: string;
  fallbackSummary: string;
  href: string;
}> = [
  {
    claimId: "qa-posture",
    id: "qa",
    audience: "QA lead",
    title: "QA posture detail",
    fallbackSummary: "Blocked issues, open bugs, and board health",
    href: "/qa",
  },
  {
    claimId: "cloud-hygiene",
    id: "devops",
    audience: "DevOps / platform lead",
    title: "Cloud & deployment detail",
    fallbackSummary: "Cloud hygiene findings and deployment health",
    href: "/devops",
  },
  {
    claimId: "code-risk",
    id: "code-health",
    audience: "Engineering lead",
    title: "Code change risk detail",
    fallbackSummary: "Hotspots, risk drivers, and review priority",
    href: "/code-health",
  },
  {
    claimId: "productivity",
    id: "productivity",
    audience: "Engineering lead",
    title: "Delivery cadence detail",
    fallbackSummary: "Contributor concentration and commit signals",
    href: "/productivity",
  },
];

export function buildTeamLinks(
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

  for (const agentLink of AGENT_TEAM_LINKS) {
    const claim = briefing.claims.find((c) => c.id === agentLink.claimId);
    if (!claim || claim.verdict === "good") continue;
    links.push({
      id: agentLink.id,
      audience: agentLink.audience,
      title: agentLink.title,
      summary: claim.context || agentLink.fallbackSummary,
      href: agentLink.href,
    });
  }

  return links.slice(0, 6);
}

export function composeExecutiveDeck(input: {
  briefing: ExecutiveBriefing;
  ctx: Ctx;
  deliverySnapshot?: DeliveryAnalysisSnapshot | null;
  mapping?: ToolchainMapping | null;
  hasDelivery: boolean;
  hasEngineering: boolean;
  hasObservability: boolean;
  agentLeadershipDecisions?: AgentDecision[];
}): ExecutiveDeck {
  return {
    decisions: buildDecisions(
      input.briefing,
      input.ctx,
      input.agentLeadershipDecisions ?? [],
    ),
    portfolio: buildPortfolio(
      input.ctx,
      input.deliverySnapshot,
      input.mapping,
      input.briefing,
    ),
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
      return "Caution";
    case "at_risk":
      return "At risk";
  }
}
