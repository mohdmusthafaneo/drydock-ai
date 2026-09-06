import { displayRoleLabel } from "@/lib/governance/presentation";
import { loadLatestAgentAnalysis } from "@/lib/agent-analysis/load-latest-runs";
import { buildAgentAnalysisClaims } from "@/lib/agent-analysis/claims";
import {
  buildCodeHealthPageView,
  buildDevOpsPageView,
  buildProductivityPageView,
  buildQaPageView,
} from "@/lib/agent-analysis/presentation";
import type { AgentDecision } from "@/lib/agent-analysis/types";
import { syncAgentAnalysisRecommendations } from "@/lib/agent-analysis/sync-recommendations";
import { dismissStaleSetupRecommendations } from "@/lib/agent-analysis/dismiss-stale-setup-recs";
import { getOrganizationContext } from "@/lib/org-data";
import { prisma } from "@/lib/prisma";
import { deliveryAnalysisForFilters, resolveStoredJiraDelivery } from "@/lib/delivery-analysis/resolve";
import { DEFAULT_CODE_ANALYSIS_FILTERS } from "@/lib/code-analysis/default-filters";
import { resolveStoredCodeAnalysis, snapshotForFilters } from "@/lib/code-analysis/sync";
import { composeExecutiveBriefing } from "@/lib/executive-briefing/compose-briefing";
import type { BriefingCharts, ExecutiveBriefing } from "@/lib/executive-briefing/types";
import { mergeExecutiveBriefingSnapshot } from "@/lib/executive-briefing/snapshot-utils";
import { summarizePortfolioHygiene } from "@/lib/jira-hygiene";
import { loadComplianceFindingSummary } from "@/lib/compliance/summary";
import { loadPredictionSummary } from "@/lib/problem-prediction/load-predictions";
import { getJiraCalibrationGate } from "@/lib/jira-calibration/status";
import { isPrometheusTrulyConnected, parsePrometheusMeta } from "@/lib/prometheus-meta";
import { isGrafanaTrulyConnected, parseGrafanaMeta } from "@/lib/grafana-meta";
import { parseJiraMeta } from "@/lib/jira-meta";
import { resolveEffectiveToolchainMapping } from "@/lib/toolchain-mapping";
import { filterPortfolioReleases } from "@/lib/release-source";
import type { JiraConnectionState } from "@/lib/executive-briefing/health-score";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";
import type { ObservabilityAnalysisSnapshot } from "@/lib/observability-analysis/types";
import {
  isAssessDataStale,
  resolveAssessSourceFreshness,
} from "@/lib/release-assess-snapshot";

const DEFAULT_DELIVERY_FILTERS = {
  projectKey: null,
  riskFocus: "all" as const,
  range: "30d" as const,
  compare: "previous_sync" as const,
};

function countActiveAuthors(
  codeSnapshot: ReturnType<typeof snapshotForFilters> | null,
): { count: number; topAuthors: { login: string; commits: number }[] } {
  if (!codeSnapshot?.byAuthor?.length) {
    return { count: 0, topAuthors: [] };
  }
  const active = codeSnapshot.byAuthor.filter((a) => a.commits > 0);
  return {
    count: active.length,
    topAuthors: [...active]
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 3)
      .map((a) => ({ login: a.login, commits: a.commits })),
  };
}

function resolveObservabilitySnapshot(
  integrations: Awaited<ReturnType<typeof getOrganizationContext>>["integrations"],
): {
  snapshot: ObservabilityAnalysisSnapshot | null;
  isDemo: boolean;
  syncedAt: string | null;
} {
  const prometheus = integrations.find(
    (i) => i.provider === "PROMETHEUS" && i.status === "CONNECTED",
  );
  const grafana = integrations.find(
    (i) => i.provider === "GRAFANA" && i.status === "CONNECTED",
  );

  if (prometheus) {
    const meta = parsePrometheusMeta(prometheus.metadataJson);
    const isStub = meta.mode === "observability-stub";
    const snapshot = meta.operationalSnapshot as ObservabilityAnalysisSnapshot | undefined;
    if (snapshot?.kpis && !isStub) {
      return {
        snapshot,
        isDemo: false,
        syncedAt: prometheus.lastSyncAt?.toISOString() ?? snapshot.generatedAt ?? null,
      };
    }
    if (isStub) {
      return { snapshot: null, isDemo: true, syncedAt: prometheus.lastSyncAt?.toISOString() ?? null };
    }
  }

  if (grafana && isGrafanaTrulyConnected(grafana)) {
    const meta = parseGrafanaMeta(grafana.metadataJson);
    const snapshot = meta.metricsSnapshot as ObservabilityAnalysisSnapshot | undefined;
    if (snapshot?.kpis) {
      return {
        snapshot,
        isDemo: false,
        syncedAt: grafana.lastSyncAt?.toISOString() ?? snapshot.generatedAt ?? null,
      };
    }
  }

  if (prometheus && isPrometheusTrulyConnected(prometheus)) {
    return {
      snapshot: null,
      isDemo: false,
      syncedAt: prometheus.lastSyncAt?.toISOString() ?? null,
    };
  }

  return { snapshot: null, isDemo: false, syncedAt: null };
}

function buildBriefingCharts(input: {
  deliverySnapshot: ReturnType<typeof deliveryAnalysisForFilters> | null;
  codeSnapshot: ReturnType<typeof snapshotForFilters> | null;
  observabilitySnapshot: ObservabilityAnalysisSnapshot | null;
  observabilityIsDemo: boolean;
  releases: ReturnType<typeof filterPortfolioReleases<
    Awaited<ReturnType<typeof getOrganizationContext>>["releases"][number]
  >>;
  recommendations: Awaited<ReturnType<typeof getOrganizationContext>>["recommendations"];
  approvals: Awaited<ReturnType<typeof getOrganizationContext>>["approvals"];
  integrations: Awaited<ReturnType<typeof getOrganizationContext>>["integrations"];
  approvalLevelLabels: Record<string, string>;
}): BriefingCharts {
  const latestAssessed = [...input.releases]
    .filter((r) => r.assessedAt)
    .sort(
      (a, b) =>
        new Date(b.assessedAt!).getTime() - new Date(a.assessedAt!).getTime(),
    )[0];

  let release: BriefingCharts["release"] = null;
  if (latestAssessed?.assessedAt) {
    const releaseRecIds = new Set(
      input.recommendations
        .filter((rec) => rec.releaseId === latestAssessed.id)
        .map((rec) => rec.id),
    );
    const pendingApprovals = input.approvals.filter(
      (a) =>
        a.recommendationId != null &&
        releaseRecIds.has(a.recommendationId) &&
        !a.decision,
    );
    const pendingRecs = input.recommendations.filter((rec) =>
      pendingApprovals.some((a) => a.recommendationId === rec.id),
    );
    const pendingRoles = [
      ...new Set(
        pendingRecs
          .map((r) => r.requiredRole)
          .filter((role): role is NonNullable<typeof role> => role != null)
          .map((role) =>
            displayRoleLabel(role, input.approvalLevelLabels as Parameters<typeof displayRoleLabel>[1]),
          ),
      ),
    ];
    const sourceFreshness = resolveAssessSourceFreshness(input.integrations);
    const staleData = isAssessDataStale({
      assessedAt: latestAssessed.assessedAt,
      sourceFreshness,
    });

    release = {
      releaseId: latestAssessed.id,
      releaseName: latestAssessed.name,
      version: latestAssessed.version,
      environment: latestAssessed.environment,
      readinessScore: latestAssessed.readinessScore,
      governanceRiskScore: latestAssessed.governanceRiskScore,
      riskLevel: latestAssessed.riskLevel,
      primaryRecommendation: latestAssessed.primaryRecommendation,
      assessmentSummary: latestAssessed.assessmentSummary,
      qaSignalsJson: latestAssessed.qaSignalsJson,
      testGapsJson: latestAssessed.testGapsJson,
      telemetryJson: latestAssessed.telemetryJson,
      postDeployComparisonJson: latestAssessed.postDeployComparisonJson,
      assessedAt: latestAssessed.assessedAt.toISOString(),
      pendingApprovalCount: pendingApprovals.length,
      pendingApprovalRoles: pendingRoles,
      staleData,
    };
  }

  return {
    delivery: input.deliverySnapshot
      ? { riskMix: input.deliverySnapshot.riskMix }
      : null,
    engineering:
      input.codeSnapshot && input.codeSnapshot.byAuthor.length > 0
        ? { byAuthor: input.codeSnapshot.byAuthor }
        : null,
    stability:
      input.observabilitySnapshot && !input.observabilityIsDemo
        ? {
            openAlerts: input.observabilitySnapshot.kpis.openAlerts,
            healthScore: input.observabilitySnapshot.kpis.healthScore,
          }
        : null,
    release,
  };
}

export async function loadExecutiveBriefing(
  organizationId: string,
  options?: { applyLlmSnapshot?: boolean },
): Promise<{
  briefing: ExecutiveBriefing;
  charts: BriefingCharts;
  ctx: Awaited<ReturnType<typeof getOrganizationContext>>;
  orgName: string;
  deliverySnapshot: ReturnType<typeof deliveryAnalysisForFilters> | null;
  effectiveMapping: ToolchainMapping | null;
  jiraConnection: JiraConnectionState;
  agentFreshness: import("@/lib/agent-analysis/types").AgentRunFreshness[];
  agentLeadershipDecisions: AgentDecision[];
}> {
  const applyLlmSnapshot = options?.applyLlmSnapshot ?? true;
  const [ctx, org, jiraStored, githubIntegration, complianceSummary, predictionSummary, calibrationGate, effectiveMapping, agentAnalysis] =
    await Promise.all([
    getOrganizationContext(organizationId),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
    resolveStoredJiraDelivery(organizationId),
    prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "GITHUB" },
      },
      select: { metadataJson: true, status: true, lastSyncAt: true },
    }),
    loadComplianceFindingSummary(organizationId).catch(() => ({
      openCount: 0,
      criticalOpen: 0,
      warningOpen: 0,
      infoOpen: 0,
      lastEvaluatedAt: null,
      resolvedThisWeek: 0,
    })),
    loadPredictionSummary(organizationId).catch(() => ({
      openCount: 0,
      criticalOpen: 0,
      warningOpen: 0,
      infoOpen: 0,
      lastEvaluatedAt: null,
    })),
    getJiraCalibrationGate(organizationId),
    resolveEffectiveToolchainMapping(organizationId),
    loadLatestAgentAnalysis(organizationId).catch(() => ({
      qa: null,
      devops: null,
      governance: null,
      productivity: null,
      freshness: [],
    })),
  ]);

  void syncAgentAnalysisRecommendations(organizationId, agentAnalysis).catch(() => undefined);
  void dismissStaleSetupRecommendations(organizationId).catch(() => undefined);

  const jiraIntegration = ctx.integrations.find((i) => i.provider === "JIRA");
  const jiraMeta = jiraIntegration ? parseJiraMeta(jiraIntegration.metadataJson) : null;
  const jiraConnection: JiraConnectionState = {
    connected: jiraIntegration?.status === "CONNECTED",
    projectKeysSelected: (jiraMeta?.projectKeys?.length ?? 0) > 0,
    hasSnapshot: Boolean(jiraMeta?.deliverySnapshot?.syncedAt),
  };

  const deliverySnapshot = jiraStored
    ? deliveryAnalysisForFilters(jiraStored, DEFAULT_DELIVERY_FILTERS, {
        pending: !jiraStored.calibrationGate?.calibrated,
        message: jiraStored.calibrationGate?.message,
      })
    : null;

  const jiraHygieneSummary = summarizePortfolioHygiene(jiraStored?.jiraHygiene);

  const codeStored =
    githubIntegration?.status === "CONNECTED"
      ? await resolveStoredCodeAnalysis(organizationId, githubIntegration.metadataJson)
      : null;
  const codeSnapshot = codeStored
    ? snapshotForFilters(codeStored, DEFAULT_CODE_ANALYSIS_FILTERS)
    : null;

  const { snapshot: observabilitySnapshot, isDemo: observabilityIsDemo, syncedAt: obsSyncedAt } =
    resolveObservabilitySnapshot(ctx.integrations);

  const portfolioReleases = filterPortfolioReleases(ctx.releases);
  const latestRelease = portfolioReleases[0] ?? null;
  const assessedReleases = portfolioReleases.filter((r) => r.assessedAt);
  const { count: activeAuthors, topAuthors } = countActiveAuthors(codeSnapshot);

  const agentAnalyzedAt =
    agentAnalysis.freshness
      .map((f) => f.analyzedAt)
      .filter((t): t is string => Boolean(t))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  const deterministic = composeExecutiveBriefing({
    orgName: org?.name ?? "Your organization",
    stats: ctx.stats,
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
    hasAssessedRelease: assessedReleases.length > 0,
    assessmentSummary: latestRelease?.assessmentSummary ?? null,
    deliverySnapshot,
    codeSnapshot,
    observabilitySnapshot,
    observabilityIsDemo,
    jiraHygiene: jiraHygieneSummary,
    jiraCalibrationPending: !calibrationGate.calibrated && calibrationGate.status !== "not_applicable",
    jiraCalibrationMessage: calibrationGate.message,
    jiraConnection,
    mapping: effectiveMapping,
    connectedTools: ctx.stats.connectedTools,
    activeAuthors: codeSnapshot ? activeAuthors : undefined,
    topAuthors: codeSnapshot ? topAuthors : undefined,
    integrationFreshness: {
      jiraSyncedAt: jiraStored?.snapshot.syncedAt ?? null,
      githubSyncedAt: codeStored?.syncedAt ?? githubIntegration?.lastSyncAt?.toISOString() ?? null,
      observabilitySyncedAt: obsSyncedAt,
      agentAnalyzedAt,
    },
    complianceSummary,
    predictionSummary,
    agentAnalysis,
    agentAnalysisClaims: buildAgentAnalysisClaims(agentAnalysis),
    jiraSnapshot: jiraStored?.snapshot ?? null,
  });

  const qaView = buildQaPageView(agentAnalysis.qa);
  const devopsView = buildDevOpsPageView(agentAnalysis.devops, {
    degradedDeployments: ctx.stats.degradedDeployments,
    rollbackPending: ctx.stats.rollbackPending,
    deploymentEventCount: ctx.deploymentEvents.length,
  });
  const codeHealthView = buildCodeHealthPageView(agentAnalysis.governance);
  const productivityView = buildProductivityPageView(agentAnalysis.productivity);

  const agentLeadershipDecisions = [
    ...qaView.decisions,
    ...devopsView.decisions,
    ...codeHealthView.decisions,
    ...productivityView.decisions,
  ].filter((d) => d.audience === "leadership");

  let briefing = deterministic;

  if (applyLlmSnapshot) {
    const snapshot = await prisma.executiveBriefingSnapshot.findUnique({
      where: { organizationId },
    });

    briefing = mergeExecutiveBriefingSnapshot(deterministic, snapshot);
  }
  const charts = buildBriefingCharts({
    deliverySnapshot,
    codeSnapshot,
    observabilitySnapshot,
    observabilityIsDemo,
    releases: portfolioReleases,
    recommendations: ctx.recommendations,
    approvals: ctx.approvals,
    integrations: ctx.integrations,
    approvalLevelLabels: ctx.approvalLevelLabels,
  });

  return {
    briefing,
    charts,
    ctx,
    orgName: org?.name ?? "Your organization",
    deliverySnapshot,
    effectiveMapping,
    jiraConnection,
    agentFreshness: agentAnalysis.freshness,
    agentLeadershipDecisions,
  };
}
