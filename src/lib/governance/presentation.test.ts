import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildApprovalsHeroSummary,
  buildDeploymentHealthSummary,
  buildOpenIncidentsClaim,
  buildReleasePortfolioHighlights,
  impactVerdictLabel,
  releaseListVerdict,
  sortIncidentsByUrgency,
  sortRecommendationsByUrgency,
  workflowModeLabel,
} from "./presentation";

describe("governance presentation", () => {
  it("sorts recommendations by impact then confidence", () => {
    const sorted = sortRecommendationsByUrgency([
      { impact: "LOW", confidence: 0.9 },
      { impact: "CRITICAL", confidence: 0.5 },
      { impact: "HIGH", confidence: 0.95 },
    ]);
    assert.deepEqual(
      sorted.map((r) => r.impact),
      ["CRITICAL", "HIGH", "LOW"],
    );
  });

  it("maps impact to plain verdict labels", () => {
    assert.equal(impactVerdictLabel("CRITICAL"), "Action needed");
    assert.equal(impactVerdictLabel("LOW"), "Informational");
  });

  it("builds release-blocking hero when approvals block a single release", () => {
    const hero = buildApprovalsHeroSummary({
      approvals: [
        {
          id: "a1",
          decision: null,
          type: "RECOMMENDATION",
          recommendation: { releaseId: "r1", impact: "HIGH" },
        },
      ],
      releases: [{ id: "r1", name: "Release 2.4" }],
      stats: { pendingApprovals: 1 },
    } as Parameters<typeof buildApprovalsHeroSummary>[0]);

    assert.match(hero.headline, /Release 2\.4/);
    assert.match(hero.subcopy, /sign-off/i);
  });

  it("sorts incidents by open status then severity", () => {
    const sorted = sortIncidentsByUrgency([
      { id: "a", status: "CLOSED", severityScore: 90, detectedAt: new Date() },
      { id: "b", status: "OPEN", severityScore: 50, detectedAt: new Date() },
      { id: "c", status: "OPEN", severityScore: 80, detectedAt: new Date() },
    ] as Parameters<typeof sortIncidentsByUrgency>[0]);

    assert.deepEqual(
      sorted.map((i) => i.id),
      ["c", "b", "a"],
    );
  });

  it("builds open incidents claim for high severity", () => {
    const claim = buildOpenIncidentsClaim({
      incidents: [
        {
          id: "i1",
          title: "API latency spike",
          status: "OPEN",
          severityScore: 85,
          release: { name: "Release 2.1" },
        },
      ],
    } as Parameters<typeof buildOpenIncidentsClaim>[0]);

    assert.equal(claim.verdict, "risk");
    assert.equal(claim.metric, "1");
  });

  it("reports healthy deployments when none are degraded", () => {
    const summary = buildDeploymentHealthSummary({
      stats: { degradedDeployments: 0, rollbackPending: 0 },
      deploymentEvents: [{ id: "d1" }, { id: "d2" }],
    } as Parameters<typeof buildDeploymentHealthSummary>[0]);

    assert.equal(summary.verdict, "good");
    assert.match(summary.headline, /healthy/i);
  });

  it("maps workflow modes to plain labels", () => {
    assert.equal(workflowModeLabel("lean-mvp"), "Lean MVP");
  });

  it("derives release list verdict from primary recommendation", () => {
    assert.equal(releaseListVerdict({ status: "ASSESSED", primaryRecommendation: "BLOCK", governanceRiskScore: 20 }), "NO-GO");
  });

  it("builds release portfolio highlight counts", () => {
    const highlights = buildReleasePortfolioHighlights([
      { status: "PENDING_APPROVAL", createdAt: new Date(), governanceRiskScore: 10 },
      { status: "DEPLOYED", createdAt: new Date(), governanceRiskScore: 0 },
      { status: "BLOCKED", createdAt: new Date(), governanceRiskScore: 80 },
    ] as Parameters<typeof buildReleasePortfolioHighlights>[0]);

    assert.equal(highlights.find((h) => h.id === "blocked")?.value, "1");
    assert.equal(highlights.find((h) => h.id === "deployed")?.value, "1");
  });
});
