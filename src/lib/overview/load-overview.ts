import { loadLatestAgentAnalysis } from "@/lib/agent-analysis/load-latest-runs";
import { DEFAULT_CODE_ANALYSIS_FILTERS } from "@/lib/code-analysis/default-filters";
import { resolveStoredCodeAnalysis, snapshotForFilters } from "@/lib/code-analysis/sync";
import { loadComplianceFindingSummary } from "@/lib/compliance/summary";
import { computeBurndown } from "@/lib/delivery-analysis/burndown";
import { loadDeliveryAnalysisHistory } from "@/lib/delivery-analysis/persist";
import {
  deliveryAnalysisForFilters,
  resolveStoredJiraDelivery,
} from "@/lib/delivery-analysis/resolve";
import type { DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";
import {
  computeDeliveryHealthScore,
  scoreToBand,
  type JiraConnectionState,
} from "@/lib/executive-briefing/health-score";
import type { HealthBand } from "@/lib/executive-briefing/types";
import { summarizePortfolioHygiene } from "@/lib/jira-hygiene";
import { parseJiraMeta } from "@/lib/jira-meta";
import { getOrganizationContext } from "@/lib/org-data";
import { computeActivityHeatmap } from "@/lib/overview/activity-heatmap";
import { getOverviewFixture } from "@/lib/overview/fixture";
import type {
  ConfidenceBand,
  OverviewDashboardModel,
  OverviewPillar,
  OverviewSnapshotPayload,
  OverviewTakeaway,
} from "@/lib/overview/types";
import { prisma } from "@/lib/prisma";
import { filterPortfolioReleases } from "@/lib/release-source";
import { readJsonField } from "@/lib/json-field";

const DEFAULT_DELIVERY_FILTERS = {
  projectKey: null as string | null,
  riskFocus: "all" as const,
  range: "30d" as const,
  compare: "previous_sync" as const,
};

const BAND_LABEL: Record<HealthBand, ConfidenceBand> = {
  strong: "Strong",
  steady: "Steady",
  caution: "Caution",
  at_risk: "At risk",
};

const TREND_TARGET_DEFAULT = 80;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = startOfUtcDay(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function emptyModel(input: {
  greetingName: string;
  teamKey?: string | null;
}): OverviewDashboardModel {
  return {
    greetingName: input.greetingName,
    sprint: {
      id: "",
      name: "No active sprint",
      startLabel: "—",
      endLabel: "—",
      rangeLabel: "No active sprint",
    },
    teamKey: input.teamKey ?? null,
    teams: [],
    deliveryConfidence: {
      score: 0,
      band: "At risk",
      caption: "Connect Jira and sync to see delivery confidence.",
      metrics: [],
    },
    keyTakeaways: [],
    pillars: [],
    deliveryTrend: {
      points: [],
      target: TREND_TARGET_DEFAULT,
      rangeLabel: "Last 6 weeks",
    },
    burndown: { ideal: [], actual: [], completed: 0, total: 0 },
    heatmap: { rows: [], dayLabels: [], rangeLabel: "Last 2 weeks" },
    attention: null,
    leadership: { count: 0, href: "/approvals" },
    lastSyncAt: null,
    empty: true,
  };
}

function resolveActiveSprint(
  delivery: DeliveryAnalysisSnapshot | null,
  sprintId?: string | null,
) {
  if (!delivery?.sprints?.length) return null;
  if (sprintId) {
    const byId = delivery.sprints.find(
      (s) => String(s.sprintId ?? "") === sprintId || s.name === sprintId,
    );
    if (byId) return byId;
  }
  const active = delivery.sprints.find((s) => s.state === "active");
  if (active) return active;
  return delivery.sprints[0] ?? null;
}

function qaPillarScore(openBugs: number): number {
  let score = 90;
  if (openBugs > 0) score -= Math.min(50, Math.round(openBugs / 4));
  if (openBugs > 100) score -= 15;
  return clampScore(score);
}

function pillarTone(score: number, delta: number | null): string {
  if (score < 50) return "danger";
  if (score < 65) return "warning";
  if (delta != null && delta < -5) return "warning";
  return "info";
}

function buildTrendPoints(
  history: Array<{ syncedAt: Date; healthScore: number; snapshotJson: unknown }>,
  completionFallback: number | null,
): { label: string; value: number }[] {
  if (history.length > 0) {
    // Weekly buckets: take the latest healthScore in each ISO week, last 6 weeks.
    const byWeek = new Map<string, { date: Date; value: number }>();
    for (const row of history) {
      const d = row.syncedAt;
      const weekStart = addUtcDays(startOfUtcDay(d), -((d.getUTCDay() + 6) % 7));
      const key = weekStart.toISOString().slice(0, 10);
      const prev = byWeek.get(key);
      if (!prev || d >= prev.date) {
        byWeek.set(key, { date: d, value: row.healthScore });
      }
    }
    const points = [...byWeek.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([, v]) => ({ label: dayLabel(v.date), value: clampScore(v.value) }));
    if (points.length > 0) return points;
  }

  // Synthesize from current completion when history is missing.
  const base = completionFallback ?? 50;
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const date = addUtcDays(now, -7 * (5 - i));
    const drift = (i - 5) * 3;
    return { label: dayLabel(date), value: clampScore(base + drift) };
  });
}

async function countResolvedComplianceThisWeek(organizationId: string): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    return await prisma.complianceFinding.count({
      where: {
        organizationId,
        status: "resolved",
        resolvedAt: { gte: weekAgo },
      },
    });
  } catch {
    return 0;
  }
}

async function loadPriorOverviewPayload(
  organizationId: string,
  projectKey: string | null,
): Promise<OverviewSnapshotPayload | null> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    const row = await prisma.overviewSnapshot.findFirst({
      where: {
        organizationId,
        capturedAt: { lte: weekAgo },
        ...(projectKey
          ? { projectKey }
          : { OR: [{ projectKey: null }, { projectKey: "" }] }),
      },
      orderBy: { capturedAt: "desc" },
      select: { payloadJson: true },
    });
    if (!row) return null;
    return readJsonField<OverviewSnapshotPayload | null>(row.payloadJson, null);
  } catch {
    return null;
  }
}

async function buildRemainingByDay(input: {
  organizationId: string;
  sprintId: string | null;
  committed: number;
  done: number;
  start: Date;
  end: Date;
}): Promise<{ date: Date; remaining: number }[]> {
  const start = startOfUtcDay(input.start);
  const end = startOfUtcDay(input.end);
  const span = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
  );

  let tickets: Array<{ resolvedAt: Date | null; ticketUpdatedAt: Date | null; status: string | null }> =
    [];
  try {
    tickets = await prisma.ticketSnapshot.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.sprintId ? { sprintId: input.sprintId } : {}),
      },
      select: { resolvedAt: true, ticketUpdatedAt: true, status: true },
      take: 5000,
    });
  } catch {
    tickets = [];
  }

  const points: { date: Date; remaining: number }[] = [];
  if (tickets.length > 0) {
    for (let i = 0; i <= span; i++) {
      const day = addUtcDays(start, i);
      const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);
      const remaining = tickets.filter((t) => {
        if (t.resolvedAt && t.resolvedAt <= dayEnd) return false;
        const status = (t.status ?? "").toLowerCase();
        if (
          !t.resolvedAt &&
          (status === "done" || status === "closed" || status === "resolved") &&
          t.ticketUpdatedAt &&
          t.ticketUpdatedAt <= dayEnd
        ) {
          return false;
        }
        return true;
      }).length;
      points.push({ date: day, remaining });
    }
    return points;
  }

  // Infer linear actual path from committed → remaining when ticket rows are absent.
  const finalRemaining = Math.max(0, input.committed - input.done);
  for (let i = 0; i <= span; i++) {
    const day = addUtcDays(start, i);
    const remaining = Math.round(
      input.committed + (finalRemaining - input.committed) * (i / span),
    );
    points.push({ date: day, remaining: Math.max(0, remaining) });
  }
  return points;
}

function buildTakeaways(input: {
  blocked: number;
  blockedDelta: number | null;
  atRisk: number;
  aiLinesPct: number;
  highRiskCount: number;
  openFindings: number;
  resolvedThisWeek: number;
}): OverviewTakeaway[] {
  const items: OverviewTakeaway[] = [];

  if (input.blocked > 0) {
    const deltaPart =
      input.blockedDelta != null
        ? ` (${input.blockedDelta >= 0 ? "+" : ""}${input.blockedDelta} vs last week)`
        : "";
    items.push({
      id: "blocked",
      title: `${input.blocked} blocked issue${input.blocked === 1 ? "" : "s"}${deltaPart}`,
      subtitle: "Ask engineering for an owner and ETA on each blocker.",
      href: "/delivery-analysis",
      tone: "danger",
      needsAction: true,
    });
  }

  if (input.atRisk > 0) {
    items.push({
      id: "at-risk",
      title: `${input.atRisk} item${input.atRisk === 1 ? "" : "s"} at risk of spillover`,
      subtitle: "Open sprint work with little time left before end date.",
      href: "/delivery-analysis",
      tone: "warning",
      needsAction: true,
    });
  }

  if (input.highRiskCount > 0) {
    items.push({
      id: "ai",
      title: `${input.highRiskCount} high-risk AI area${input.highRiskCount === 1 ? "" : "s"}`,
      subtitle: `${input.aiLinesPct}% of recent lines are AI-assisted — review before merge.`,
      href: "/code-analysis",
      tone: "warning",
      needsAction: true,
    });
  } else {
    items.push({
      id: "ai",
      title: "No high-risk AI areas",
      subtitle: `${input.aiLinesPct}% of recent lines are AI-assisted · reviews look healthy.`,
      href: "/code-analysis",
      tone: "success",
    });
  }

  if (input.openFindings > 0) {
    items.push({
      id: "compliance",
      title: `${input.openFindings} open compliance finding${input.openFindings === 1 ? "" : "s"}`,
      subtitle:
        input.resolvedThisWeek > 0
          ? `${input.resolvedThisWeek} resolved this week · review remaining items.`
          : "Review open findings before the next release gate.",
      href: "/governance",
      tone: input.openFindings >= 4 ? "warning" : "info",
      needsAction: input.openFindings >= 4,
    });
  } else {
    items.push({
      id: "compliance",
      title: "Compliance findings clear",
      subtitle:
        input.resolvedThisWeek > 0
          ? `${input.resolvedThisWeek} resolved this week.`
          : "No open compliance findings in the current sample.",
      href: "/governance",
      tone: "success",
    });
  }

  return items.slice(0, 4);
}

/**
 * Compose the Connexus-style Overview dashboard model for an organization.
 * Resilient: missing integrations yield empty:true rather than throwing.
 */
export async function loadOverviewDashboard(input: {
  organizationId: string;
  userName: string;
  teamKey?: string | null;
  sprintId?: string | null;
  useFixture?: boolean;
}): Promise<OverviewDashboardModel> {
  if (input.useFixture && process.env.NODE_ENV !== "production") {
    return getOverviewFixture({
      greetingName: input.userName.split(" ")[0] || input.userName,
      teamKey: input.teamKey ?? null,
    });
  }

  const greetingName = input.userName.split(" ")[0] || input.userName || "there";
  const teamKey = input.teamKey?.trim() || null;

  try {
    const [
      ctx,
      jiraStored,
      githubIntegration,
      complianceSummary,
      resolvedThisWeek,
      agentAnalysis,
      heatmap,
      historyRows,
      priorPayload,
    ] = await Promise.all([
      getOrganizationContext(input.organizationId).catch(() => null),
      resolveStoredJiraDelivery(input.organizationId).catch(() => null),
      prisma.integration
        .findUnique({
          where: {
            organizationId_provider: {
              organizationId: input.organizationId,
              provider: "GITHUB",
            },
          },
          select: { metadataJson: true, status: true, lastSyncAt: true },
        })
        .catch(() => null),
      loadComplianceFindingSummary(input.organizationId).catch(() => ({
        openCount: 0,
        criticalOpen: 0,
        warningOpen: 0,
        infoOpen: 0,
        lastEvaluatedAt: null,
        resolvedThisWeek: 0,
      })),
      countResolvedComplianceThisWeek(input.organizationId),
      loadLatestAgentAnalysis(input.organizationId).catch(() => ({
        qa: null,
        devops: null,
        governance: null,
        productivity: null,
        freshness: [],
      })),
      computeActivityHeatmap(input.organizationId, 14),
      loadDeliveryAnalysisHistory(input.organizationId, "90d").catch(() => []),
      loadPriorOverviewPayload(input.organizationId, teamKey),
    ]);

    if (!ctx) {
      return emptyModel({ greetingName, teamKey });
    }

    const jiraIntegration = ctx.integrations.find((i) => i.provider === "JIRA");
    const jiraMeta = jiraIntegration ? parseJiraMeta(jiraIntegration.metadataJson) : null;
    const jiraConnection: JiraConnectionState = {
      connected: jiraIntegration?.status === "CONNECTED",
      projectKeysSelected: (jiraMeta?.projectKeys?.length ?? 0) > 0,
      hasSnapshot: Boolean(jiraMeta?.deliverySnapshot?.syncedAt),
    };

    const deliverySnapshot = jiraStored
      ? deliveryAnalysisForFilters(
          jiraStored,
          { ...DEFAULT_DELIVERY_FILTERS, projectKey: teamKey },
          {
            pending: !jiraStored.calibrationGate?.calibrated,
            message: jiraStored.calibrationGate?.message,
          },
        )
      : null;

    const codeStored =
      githubIntegration?.status === "CONNECTED"
        ? await resolveStoredCodeAnalysis(
            input.organizationId,
            githubIntegration.metadataJson,
          ).catch(() => null)
        : null;
    const codeSnapshot = codeStored
      ? snapshotForFilters(codeStored, DEFAULT_CODE_ANALYSIS_FILTERS)
      : null;

    const portfolioReleases = filterPortfolioReleases(ctx.releases);
    const latestRelease = portfolioReleases[0] ?? null;
    const assessedReleases = portfolioReleases.filter((r) => r.assessedAt);
    const jiraHygieneSummary = summarizePortfolioHygiene(jiraStored?.jiraHygiene);

    const health = computeDeliveryHealthScore({
      stats: {
        releaseReadiness: ctx.stats.releaseReadiness,
        openIncidents: ctx.stats.openIncidents,
        degradedDeployments: ctx.stats.degradedDeployments,
        errorRate: ctx.stats.errorRate,
        p95Latency: ctx.stats.p95Latency,
        pendingApprovals: ctx.stats.pendingApprovals,
        pendingReleaseApprovals: ctx.stats.pendingReleaseApprovals,
        pendingGovernanceApprovals: ctx.stats.pendingGovernanceApprovals,
        pendingSetupTasks: ctx.stats.pendingSetupTasks,
        rollbackPending: ctx.stats.rollbackPending,
        connectedTools: ctx.stats.connectedTools,
        integrationsHealthy: ctx.stats.integrationsHealthy,
      },
      latestRelease: latestRelease
        ? {
            id: latestRelease.id,
            name: latestRelease.name,
            status: latestRelease.status,
            readinessScore: latestRelease.readinessScore,
            governanceRiskScore: latestRelease.governanceRiskScore,
            assessedAt: latestRelease.assessedAt,
            assessmentSummary: latestRelease.assessmentSummary,
            metadataJson: latestRelease.metadataJson,
          }
        : null,
      deliverySnapshot,
      codeSnapshot,
      hasAssessedRelease: assessedReleases.length > 0,
      jiraHygiene: jiraHygieneSummary,
      jiraCalibrationPending:
        Boolean(jiraStored) && !jiraStored?.calibrationGate?.calibrated,
      jiraCalibrationMessage: jiraStored?.calibrationGate?.message,
      jiraConnection,
      mapping: jiraStored?.mapping ?? null,
      agentAnalysis,
    });

    const teams =
      deliverySnapshot?.byProject.map((p) => ({ key: p.key, name: p.name })) ??
      jiraStored?.snapshot.projects.map((p) => ({ key: p.key, name: p.name })) ??
      [];

    const sprint = resolveActiveSprint(deliverySnapshot, input.sprintId);
    const committed = sprint?.committed ?? 0;
    const done = sprint?.done ?? 0;
    const completionPct =
      deliverySnapshot?.kpis.sprintCompletionPct ??
      (committed > 0 ? Math.round((done / committed) * 100) : null);
    const blocked = deliverySnapshot?.kpis.blocked ?? 0;
    const atRisk =
      deliverySnapshot?.kpis.spillover ??
      deliverySnapshot?.kpis.overdue ??
      0;
    const openBugs =
      agentAnalysis.qa?.openBugs ?? deliverySnapshot?.kpis.bugsOpen ?? 0;
    const aiRisk = codeSnapshot?.aiRisk;
    const aiLinesPct = aiRisk?.aiLinesPct ?? 0;
    const highRiskCount = aiRisk?.highRiskCount ?? 0;
    const openFindings =
      complianceSummary.openCount ?? 0;
    const resolvedWeek =
      "resolvedThisWeek" in complianceSummary &&
      typeof complianceSummary.resolvedThisWeek === "number"
        ? complianceSummary.resolvedThisWeek
        : resolvedThisWeek;

    const engineeringDim = health.dimensions.find((d) => d.id === "engineering");
    const governanceDim = health.dimensions.find((d) => d.id === "governance");

    const deliveryScore = completionPct != null ? clampScore(completionPct) : 0;
    const codeScore = engineeringDim?.score ?? clampScore(100 - Math.min(40, blocked));
    const qaScore = qaPillarScore(openBugs);
    const complianceScore =
      governanceDim?.score ??
      clampScore(90 - Math.min(40, openFindings * 8));

    const priorById = new Map(
      (priorPayload?.pillars ?? []).map((p) => [p.id, p.score] as const),
    );
    const deltaFor = (id: string, score: number): number | null => {
      const prior = priorById.get(id);
      if (prior == null) return null;
      return score - prior;
    };

    const blockedDelta =
      priorPayload?.kpis.blocked != null
        ? blocked - priorPayload.kpis.blocked
        : null;

    const pillars: OverviewPillar[] = [
      {
        id: "delivery",
        name: "Delivery",
        score: deliveryScore,
        delta: deltaFor("delivery", deliveryScore),
        footnote:
          committed > 0 ? `${done} / ${committed} completed` : "No sprint scope yet",
        progress: deliveryScore,
        tone: pillarTone(deliveryScore, deltaFor("delivery", deliveryScore)),
      },
      {
        id: "code",
        name: "Code",
        score: codeScore,
        delta: deltaFor("code", codeScore),
        footnote: `${blocked} blocked issue${blocked === 1 ? "" : "s"}`,
        progress: codeScore,
        tone: pillarTone(codeScore, deltaFor("code", codeScore)),
      },
      {
        id: "qa",
        name: "QA",
        score: qaScore,
        delta: deltaFor("qa", qaScore),
        footnote: `${openBugs} open bug${openBugs === 1 ? "" : "s"}`,
        progress: qaScore,
        tone: pillarTone(qaScore, deltaFor("qa", qaScore)),
      },
      {
        id: "compliance",
        name: "Compliance",
        score: complianceScore,
        delta: deltaFor("compliance", complianceScore),
        footnote: `${openFindings} open finding${openFindings === 1 ? "" : "s"}`,
        progress: complianceScore,
        tone: pillarTone(complianceScore, deltaFor("compliance", complianceScore)),
      },
    ];

    const overall =
      health.overall ??
      clampScore(
        (deliveryScore + codeScore + qaScore + complianceScore) / 4,
      );
    const bandKey = health.band ?? scoreToBand(overall);
    const band = BAND_LABEL[bandKey];
    const sprintName = sprint?.name ?? deliverySnapshot?.scopeLabel ?? "This sprint";
    const caption =
      bandKey === "at_risk" || bandKey === "caution"
        ? `${sprintName} is at risk of delay`
        : bandKey === "strong"
          ? `${sprintName} is on track`
          : `${sprintName} is holding steady`;

    const startDate = sprint?.startDate ? new Date(sprint.startDate) : null;
    const endDate = sprint?.endDate ? new Date(sprint.endDate) : null;
    const startLabel = startDate && !Number.isNaN(startDate.getTime())
      ? dayLabel(startDate)
      : "—";
    const endLabel =
      endDate && !Number.isNaN(endDate.getTime()) ? dayLabel(endDate) : "—";

    const remainingByDay =
      committed > 0 && startDate && endDate && !Number.isNaN(startDate.getTime())
        ? await buildRemainingByDay({
            organizationId: input.organizationId,
            sprintId: sprint?.sprintId != null ? String(sprint.sprintId) : null,
            committed,
            done,
            start: startDate,
            end: endDate,
          })
        : [];

    const burndown =
      committed > 0 && startDate && endDate
        ? computeBurndown({
            committed,
            start: startDate,
            end: endDate,
            remainingByDay,
          })
        : { ideal: [], actual: [], completed: done, total: committed };

    const takeaways = buildTakeaways({
      blocked,
      blockedDelta,
      atRisk,
      aiLinesPct,
      highRiskCount,
      openFindings,
      resolvedThisWeek: resolvedWeek,
    });
    const needsAction = takeaways.filter((t) => t.needsAction);
    const attention =
      needsAction.length > 0
        ? {
            count: needsAction.length,
            message: needsAction[0]!.subtitle,
            href: needsAction[0]!.href,
          }
        : null;

    const lastSyncAt = ctx.integrations
      .map((i) => i.lastSyncAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime())[0]
      ?.toISOString() ?? null;

    const hasMeaningfulData = Boolean(
      deliverySnapshot ||
        codeSnapshot ||
        complianceSummary.openCount > 0 ||
        agentAnalysis.qa ||
        ctx.stats.connectedTools > 0,
    );

    const model: OverviewDashboardModel = {
      greetingName,
      sprint: {
        id: sprint?.sprintId != null ? String(sprint.sprintId) : sprint?.name ?? "",
        name: sprintName,
        startLabel,
        endLabel,
        rangeLabel:
          startLabel !== "—"
            ? `${sprintName} | ${startLabel} – ${endLabel}`
            : sprintName,
      },
      teamKey,
      teams,
      deliveryConfidence: {
        score: overall,
        band,
        caption,
        metrics: [
          {
            id: "completion",
            label: "Sprint completion",
            value: completionPct != null ? `${completionPct}%` : "—",
            progress: completionPct ?? 0,
            annotation: committed > 0 ? `${done} / ${committed}` : undefined,
            icon: "completion",
          },
          {
            id: "blocked",
            label: "Blocked",
            value: blocked,
            progress: Math.min(100, blocked),
            icon: "blocked",
          },
          {
            id: "at-risk",
            label: "Items at risk",
            value: atRisk,
            progress: Math.min(100, atRisk),
            icon: "risk",
          },
          {
            id: "ai-risk",
            label: "AI code risk",
            value: `${aiLinesPct}%`,
            progress: Math.min(100, aiLinesPct),
            icon: "ai",
          },
        ],
      },
      keyTakeaways: takeaways,
      pillars,
      deliveryTrend: {
        points: buildTrendPoints(historyRows, completionPct),
        target: TREND_TARGET_DEFAULT,
        rangeLabel: "Last 6 weeks",
      },
      burndown,
      heatmap,
      attention,
      leadership: {
        count: ctx.stats.pendingApprovals,
        href: "/approvals",
      },
      lastSyncAt,
      empty: !hasMeaningfulData,
    };

    return model;
  } catch (error) {
    console.error("[loadOverviewDashboard]", error);
    return emptyModel({ greetingName, teamKey });
  }
}

/** Persist pillar scores + KPI counts for WoW deltas. */
export async function captureOverviewSnapshot(
  organizationId: string,
  projectKey?: string | null,
): Promise<void> {
  try {
    const model = await loadOverviewDashboard({
      organizationId,
      userName: "system",
      teamKey: projectKey ?? null,
    });
    if (model.empty) return;

    const payload: OverviewSnapshotPayload = {
      pillars: model.pillars.map((p) => ({ id: p.id, score: p.score })),
      kpis: {
        completionPct:
          typeof model.deliveryConfidence.metrics[0]?.progress === "number"
            ? model.deliveryConfidence.metrics[0].progress
            : null,
        blocked: Number(model.deliveryConfidence.metrics[1]?.value ?? 0),
        atRisk: Number(model.deliveryConfidence.metrics[2]?.value ?? 0),
        aiRiskPct: Number(
          String(model.deliveryConfidence.metrics[3]?.value ?? "0").replace("%", ""),
        ),
        openFindings: Number(
          model.pillars.find((p) => p.id === "compliance")?.footnote.match(/\d+/)?.[0] ??
            0,
        ),
        openBugs: Number(
          model.pillars.find((p) => p.id === "qa")?.footnote.match(/\d+/)?.[0] ?? 0,
        ),
      },
    };

    await prisma.overviewSnapshot.create({
      data: {
        organizationId,
        projectKey: projectKey ?? null,
        payloadJson: payload,
      },
    });
  } catch (error) {
    console.error("[captureOverviewSnapshot]", error);
  }
}
