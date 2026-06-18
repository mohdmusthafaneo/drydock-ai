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
  it("sets primaryCta when pending approvals exist", () => {
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

    assert.ok(briefing.primaryCta);
    assert.match(briefing.primaryCta!.label, /approval/i);
    assert.equal(briefing.primaryCta!.href, "/approvals");
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
    assert.ok(stability!.severity === "critical" || stability!.severity === "warning");
  });

  it("keeps word count within 180 and avoids banned jargon", () => {
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

    assert.ok(briefing.wordCount <= 180);
    assert.ok(briefing.wordCount >= 20);
    assertNoBannedL1Terms(briefing.narrative);
  });
});
