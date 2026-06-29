import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeDeliveryHealthScore, scoreToBand } from "@/lib/executive-briefing/health-score";

describe("scoreToBand", () => {
  it("maps score ranges to band labels", () => {
    assert.equal(scoreToBand(85), "strong");
    assert.equal(scoreToBand(70), "steady");
    assert.equal(scoreToBand(50), "caution");
    assert.equal(scoreToBand(30), "at_risk");
  });
});

describe("computeDeliveryHealthScore gaps", () => {
  it("records Jira not connected in dataGaps", () => {
    const result = computeDeliveryHealthScore({
      stats: {
        releaseReadiness: 75,
        openIncidents: 0,
        degradedDeployments: 0,
        errorRate: null,
        p95Latency: null,
        pendingApprovals: 0,
        rollbackPending: 0,
        connectedTools: 1,
        integrationsHealthy: 1,
      },
      hasAssessedRelease: true,
      latestRelease: {
        id: "r1",
        name: "v1",
        status: "READY",
        readinessScore: 75,
        governanceRiskScore: 10,
        assessedAt: new Date(),
      },
    });

    assert.ok(result.dataGaps.includes("Jira not connected"));
    assert.ok(result.dataGaps.includes("GitHub activity not synced"));
  });

  it("discounts governance and momentum when Jira hygiene degrades trust", () => {
    const baseInput = {
      stats: {
        releaseReadiness: 78,
        openIncidents: 0,
        degradedDeployments: 0,
        errorRate: 0.3,
        p95Latency: 140,
        pendingApprovals: 0,
        rollbackPending: 0,
        connectedTools: 3,
        integrationsHealthy: 3,
      },
      hasAssessedRelease: true,
      latestRelease: {
        id: "rel-1",
        name: "v2.4",
        status: "STAGED" as const,
        readinessScore: 78,
        governanceRiskScore: 10,
        assessedAt: new Date(),
      },
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
    };

    const withoutHygiene = computeDeliveryHealthScore(baseInput);
    const withHygiene = computeDeliveryHealthScore({
      ...baseInput,
      jiraHygiene: {
        portfolioScore: 45,
        degradesTrust: true,
        worstProject: { key: "ACME", name: "Acme" },
        topFindings: [],
      },
    });

    const govWithout = withoutHygiene.dimensions.find((d) => d.id === "governance")!.score;
    const govWith = withHygiene.dimensions.find((d) => d.id === "governance")!.score;
    const momWithout = withoutHygiene.dimensions.find((d) => d.id === "momentum")!.score;
    const momWith = withHygiene.dimensions.find((d) => d.id === "momentum")!.score;

    assert.ok(govWith < govWithout);
    assert.ok(momWith <= momWithout);
    assert.ok(momWith <= 70);
  });
});
