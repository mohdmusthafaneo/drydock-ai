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
});
