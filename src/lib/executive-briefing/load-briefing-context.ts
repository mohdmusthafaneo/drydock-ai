import { getOrganizationContext } from "@/lib/org-data";
import { prisma } from "@/lib/prisma";
import { deliveryAnalysisForFilters, resolveStoredJiraDelivery } from "@/lib/delivery-analysis/resolve";
import { resolveStoredCodeAnalysis, snapshotForFilters } from "@/lib/code-analysis/sync";
import { composeExecutiveBriefing } from "@/lib/executive-briefing/compose-briefing";
import type { BriefingCharts, ExecutiveBriefing } from "@/lib/executive-briefing/types";
import { mergeExecutiveBriefingSnapshot } from "@/lib/executive-briefing/snapshot-utils";
import { isPrometheusTrulyConnected, parsePrometheusMeta } from "@/lib/prometheus-meta";
import { isGrafanaTrulyConnected, parseGrafanaMeta } from "@/lib/grafana-meta";
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

const CODE_FILTERS = { range: "7d" as const };

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
  releases: Awaited<ReturnType<typeof getOrganizationContext>>["releases"];
  recommendations: Awaited<ReturnType<typeof getOrganizationContext>>["recommendations"];
  approvals: Awaited<ReturnType<typeof getOrganizationContext>>["approvals"];
  integrations: Awaited<ReturnType<typeof getOrganizationContext>>["integrations"];
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
          .map((role) => role.replace(/_/g, " ")),
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
}> {
  const applyLlmSnapshot = options?.applyLlmSnapshot ?? true;
  const [ctx, org, jiraStored, githubIntegration] = await Promise.all([
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
  ]);

  const deliverySnapshot = jiraStored
    ? deliveryAnalysisForFilters(jiraStored, DEFAULT_DELIVERY_FILTERS)
    : null;

  const codeStored =
    githubIntegration?.status === "CONNECTED"
      ? await resolveStoredCodeAnalysis(organizationId, githubIntegration.metadataJson)
      : null;
  const codeSnapshot = codeStored ? snapshotForFilters(codeStored, CODE_FILTERS) : null;

  const { snapshot: observabilitySnapshot, isDemo: observabilityIsDemo, syncedAt: obsSyncedAt } =
    resolveObservabilitySnapshot(ctx.integrations);

  const latestRelease = ctx.releases[0] ?? null;
  const assessedReleases = ctx.releases.filter((r) => r.assessedAt);
  const { count: activeAuthors, topAuthors } = countActiveAuthors(codeSnapshot);

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
        }
      : null,
    hasAssessedRelease: assessedReleases.length > 0,
    assessmentSummary: latestRelease?.assessmentSummary ?? null,
    deliverySnapshot,
    codeSnapshot,
    observabilitySnapshot,
    observabilityIsDemo,
    connectedTools: ctx.stats.connectedTools,
    activeAuthors: codeSnapshot ? activeAuthors : undefined,
    topAuthors: codeSnapshot ? topAuthors : undefined,
    integrationFreshness: {
      jiraSyncedAt: jiraStored?.snapshot.syncedAt ?? null,
      githubSyncedAt: codeStored?.syncedAt ?? githubIntegration?.lastSyncAt?.toISOString() ?? null,
      observabilitySyncedAt: obsSyncedAt,
    },
  });

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
    releases: ctx.releases,
    recommendations: ctx.recommendations,
    approvals: ctx.approvals,
    integrations: ctx.integrations,
  });

  return {
    briefing,
    charts,
    ctx,
    orgName: org?.name ?? "Your organization",
  };
}
