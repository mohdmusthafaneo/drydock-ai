import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertNoBannedL1Terms,
  composeExecutiveBriefing,
} from "@/lib/executive-briefing/compose-briefing";
import { computeDeliveryHealthScore } from "@/lib/executive-briefing/health-score";

const baseStats = {
  releaseReadiness: 78,
  openIncidents: 0,
  degradedDeployments: 0,
  errorRate: 0.3,
  p95Latency: 140,
  pendingApprovals: 0,
  rollbackPending: 0,
  connectedTools: 3,
  integrationsHealthy: 3,
};

describe("computeDeliveryHealthScore", () => {
  it("computes weighted overall when all dimensions present", () => {
    const result = computeDeliveryHealthScore({
      stats: baseStats,
      latestRelease: {
        id: "rel-1",
        name: "v2.4",
        status: "STAGED",
        readinessScore: 78,
        governanceRiskScore: 20,
        assessedAt: new Date(),
      },
      hasAssessedRelease: true,
      deliverySnapshot: {
        generatedAt: new Date().toISOString(),
        projectKeys: ["ACME"],
        rangeLabel: "30d",
        kpis: {
          healthScore: 82,
          openWork: 40,
          blocked: 1,
          overdue: 0,
          resolvedLast7d: 34,
          sprintCompletionPct: 72,
        },
        riskMix: { blocked: 1, overdue: 0, bugs: 2, otherOpen: 37 },
        trend: [],
        byProject: [],
        versions: [],
        sprints: [],
        signals: [],
        gaps: [],
      },
      codeSnapshot: null,
      observabilitySnapshot: {
        generatedAt: new Date().toISOString(),
        serviceScopes: [],
        prometheusUrl: "https://prom.example",
        kpis: {
          healthScore: 84,
          errorRate: 0.3,
          p95LatencyMs: 140,
          openAlerts: 0,
          cpuUtilizationPct: 60,
          memoryUtilizationPct: 65,
          errorBudgetRemainingPct: 80,
        },
        healthMix: { healthy: 3, degraded: 1, critical: 0 },
        trend: [],
        byService: [],
        alerts: [],
        deploys: [],
        slos: [],
        signals: [],
        gaps: [],
      },
    });

    assert.equal(result.visible, true);
    assert.ok(result.overall != null && result.overall >= 60 && result.overall <= 100);
    assert.equal(result.dimensions.length, 4);
    assert.equal(result.band, result.overall! >= 80 ? "strong" : "steady");
  });

  it("includes Jira in dataGaps and caps score when release dimension missing", () => {
    const result = computeDeliveryHealthScore({
      stats: { ...baseStats, releaseReadiness: 0 },
      hasAssessedRelease: false,
      latestRelease: null,
      deliverySnapshot: {
        generatedAt: new Date().toISOString(),
        projectKeys: ["ACME"],
        rangeLabel: "30d",
        kpis: { healthScore: 70, openWork: 10, blocked: 0, overdue: 0 },
        riskMix: { blocked: 0, overdue: 0, bugs: 0, otherOpen: 10 },
        trend: [],
        byProject: [],
        versions: [],
        sprints: [],
        signals: [],
        gaps: [],
      },
    });

    assert.ok(result.dataGaps.some((g) => g.includes("No assessed release") || g.includes("Release")));
    if (result.overall != null) {
      assert.ok(result.overall <= 79);
    }
    assert.ok(!result.dimensions.some((d) => d.id === "release"));
  });

  it("hides score when no integration or release data exists", () => {
    const result = computeDeliveryHealthScore({
      stats: { ...baseStats, connectedTools: 0, integrationsHealthy: 0, releaseReadiness: 0 },
      hasAssessedRelease: false,
      latestRelease: null,
    });

    assert.equal(result.visible, false);
    assert.equal(result.overall, null);
    assert.ok(result.dataGaps.length > 0);
  });
});

describe("composeExecutiveBriefing", () => {
  it("sets insight when pending approvals exist", () => {
    const briefing = composeExecutiveBriefing({
      orgName: "Acme Corp",
      stats: { ...baseStats, pendingApprovals: 1 },
      hasAssessedRelease: true,
      latestRelease: {
        id: "rel-1",
        name: "v2.4",
        status: "STAGED",
        readinessScore: 78,
        governanceRiskScore: 15,
        assessedAt: new Date(),
      },
      connectedTools: 2,
      integrationFreshness: {
        jiraSyncedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
    });

    assert.ok(briefing.insight);
    assert.match(briefing.insight!.message, /approval/i);
    assert.equal(briefing.insight!.href, "/approvals");
    assert.match(briefing.narrative, /approval/i);
  });

  it("marks stability claim as warning or critical when incidents are open", () => {
    const briefing = composeExecutiveBriefing({
      orgName: "Acme Corp",
      stats: { ...baseStats, openIncidents: 2 },
      hasAssessedRelease: true,
      latestRelease: {
        id: "rel-1",
        name: "v2.4",
        status: "IN_QA",
        readinessScore: 70,
        governanceRiskScore: 30,
        assessedAt: new Date(),
      },
      connectedTools: 2,
      integrationFreshness: {},
    });

    const stability = briefing.claims.find((c) => c.id === "stability");
    assert.ok(stability);
    assert.equal(stability!.verdict, "risk");
  });

  it("keeps headline short and avoids banned jargon", () => {
    const briefing = composeExecutiveBriefing({
      orgName: "Acme Corp",
      stats: baseStats,
      hasAssessedRelease: true,
      latestRelease: {
        id: "rel-1",
        name: "v2.4",
        status: "STAGED",
        readinessScore: 78,
        governanceRiskScore: 10,
        assessedAt: new Date(),
      },
      connectedTools: 3,
      integrationFreshness: {
        jiraSyncedAt: new Date().toISOString(),
      },
      deliverySnapshot: {
        generatedAt: new Date().toISOString(),
        projectKeys: ["ACME"],
        rangeLabel: "30d",
        kpis: { healthScore: 85, openWork: 8, blocked: 0, overdue: 0, resolvedLast7d: 34 },
        riskMix: { blocked: 0, overdue: 0, bugs: 0, otherOpen: 8 },
        trend: [],
        byProject: [],
        versions: [],
        sprints: [],
        signals: [],
        gaps: [],
      },
    });

    assert.ok(briefing.wordCount <= 45);
    assert.ok(briefing.wordCount >= 8);
    assert.ok(briefing.headline.length > 0);
    assert.ok(briefing.highlights.length > 0);
    assert.ok(briefing.meta.length > 0);
    assertNoBannedL1Terms(briefing.narrative);
  });

  it("surfaces Jira hygiene in data confidence claim when trust is degraded", () => {
    const briefing = composeExecutiveBriefing({
      orgName: "Acme Corp",
      stats: baseStats,
      hasAssessedRelease: true,
      latestRelease: {
        id: "rel-1",
        name: "v2.4",
        status: "STAGED",
        readinessScore: 78,
        governanceRiskScore: 10,
        assessedAt: new Date(),
      },
      connectedTools: 3,
      integrationFreshness: {
        jiraSyncedAt: new Date().toISOString(),
      },
      jiraHygiene: {
        portfolioScore: 42,
        degradesTrust: true,
        worstProject: { key: "ACME", name: "Acme" },
        topFindings: [],
      },
    });

    const governance = briefing.claims.find((c) => c.id === "governance");
    assert.ok(governance);
    assert.equal(governance!.verdictLabel, "Low Jira trust");
    assert.match(governance!.context, /ACME/i);
  });

  it("always surfaces AI code risk on the dashboard when code analysis exists", () => {
    const briefing = composeExecutiveBriefing({
      orgName: "Acme Corp",
      stats: baseStats,
      hasAssessedRelease: true,
      latestRelease: {
        id: "rel-1",
        name: "v2.4",
        status: "STAGED",
        readinessScore: 78,
        governanceRiskScore: 10,
        assessedAt: new Date(),
      },
      connectedTools: 3,
      integrationFreshness: {
        githubSyncedAt: new Date().toISOString(),
      },
      deliverySnapshot: {
        generatedAt: new Date().toISOString(),
        projectKeys: ["ACME"],
        rangeLabel: "30d",
        kpis: { healthScore: 85, openWork: 8, blocked: 0, overdue: 0, resolvedLast7d: 34 },
        riskMix: { blocked: 0, overdue: 0, bugs: 0, otherOpen: 8 },
        trend: [],
        byProject: [],
        versions: [],
        sprints: [],
        signals: [],
        gaps: [],
      },
      codeSnapshot: {
        generatedAt: new Date().toISOString(),
        rangeLabel: "Last 7 days",
        repos: ["acme/app"],
        kpis: {
          aiLinesPct: 12,
          aiLinesPctDelta: 0,
          aiCommitsPct: 10,
          aiCommitsPctDelta: 0,
          aiPrsPct: 8,
          aiPrsPctDelta: 0,
          reviewCoverageOnAiPrsPct: 100,
        },
        attribution: {
          human_only: { count: 5, lines: 400 },
          ai_assisted: { count: 1, lines: 50 },
          ai_generated: { count: 0, lines: 0 },
          unknown: { count: 0, lines: 0 },
        },
        trend: [],
        byRepo: [],
        byAuthor: [],
        pullRequests: [],
        commits: [],
        files: [],
        tools: [],
        governanceSignals: [],
        aiRisk: {
          aiLinesPct: 12,
          highRiskCount: 0,
          unreviewedAiPrs: 0,
          unlinkedAiPrs: 0,
          avgCompletionScore: null,
        },
      },
    });

    const aiRisk = briefing.claims.find((c) => c.id === "ai-code-risk");
    assert.ok(aiRisk);
    assert.equal(aiRisk!.verdict, "good");
    assert.equal(aiRisk!.verdictLabel, "Under control");
    assert.equal(aiRisk!.metric, "12%");
  });

  it("adds hygiene insight when Jira trust is degraded", () => {
    const briefing = composeExecutiveBriefing({
      orgName: "Acme Corp",
      stats: baseStats,
      hasAssessedRelease: true,
      latestRelease: {
        id: "rel-1",
        name: "v2.4",
        status: "STAGED",
        readinessScore: 78,
        governanceRiskScore: 10,
        assessedAt: new Date(),
      },
      connectedTools: 3,
      integrationFreshness: {},
      jiraHygiene: {
        portfolioScore: 50,
        degradesTrust: true,
        worstProject: { key: "PROJ", name: "Project" },
        topFindings: [],
      },
    });

    assert.ok(briefing.insight);
    assert.match(briefing.insight!.message, /PROJ/i);
    assert.equal(briefing.insight!.href, "/delivery-analysis");
  });
});
