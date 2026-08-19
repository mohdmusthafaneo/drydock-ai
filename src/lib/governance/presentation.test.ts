import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildApprovalsHeroSummary,
  buildDeliveryConfidenceOneLiner,
  buildDeploymentHealthSummary,
  buildObservabilityStabilitySummary,
  buildOpenIncidentsClaim,
  buildQaOrgVerdict,
  buildReleasePortfolioHighlights,
  buildGovernanceDnaOverview,
  buildGovernanceHeadlineSegments,
  categorizeAuditAction,
  filterAuditLogs,
  findLastGovernanceDecision,
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
          recommendation: { releaseId: "r1", impact: "HIGH", queue: "RELEASE_GATE" },
        },
      ],
      releases: [{ id: "r1", name: "Release 2.4" }],
      stats: { pendingApprovals: 1, pendingReleaseApprovals: 1, pendingGovernanceApprovals: 0 },
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

  it("builds QA org verdict for blocked releases", () => {
    const verdict = buildQaOrgVerdict({
      orgReadinessIndex: 55,
      pendingDecisions: 1,
      openGaps: 3,
      noGoCount: 1,
      holdCount: 0,
      assessedCount: 2,
    });
    assert.equal(verdict.verdict, "risk");
    assert.match(verdict.headline, /blocked/i);
  });

  it("reports stable observability when no incidents", () => {
    const summary = buildObservabilityStabilitySummary({
      stats: { openIncidents: 0, degradedDeployments: 0, errorRate: 0.5, metricCount: 12 },
      incidents: [],
    } as unknown as Parameters<typeof buildObservabilityStabilitySummary>[0]);
    assert.equal(summary.verdict, "good");
    assert.match(summary.headline, /stable/i);
  });

  it("flags delivery confidence when blockers exist", () => {
    const line = buildDeliveryConfidenceOneLiner({
      healthScore: 72,
      blocked: 2,
      overdue: 1,
      sprintCompletionPct: 80,
    });
    assert.equal(line.verdict, "risk");
    assert.match(line.headline, /blocked/i);
  });

  it("categorizes and filters audit approval actions", () => {
    assert.equal(categorizeAuditAction("recommendation.approved"), "approvals");
    const logs = [
      { action: "recommendation.approved" },
      { action: "release.deployed" },
    ];
    assert.equal(filterAuditLogs(logs, "approvals").length, 1);
    assert.equal(
      findLastGovernanceDecision(logs.map((l, i) => ({
        ...l,
        entityType: "Approval",
        createdAt: new Date(),
        userName: i === 0 ? "Alex" : null,
      })))?.action,
      "recommendation.approved",
    );
  });

  it("builds plain-language DNA overview from structured fields", () => {
    const overview = buildGovernanceDnaOverview(
      {
        workflowMode: "scaled-agile",
        autonomyMode: "RECOMMEND",
        approvalLevel: 3,
        riskThreshold: 0.64,
        observabilityStrategy: "Establish baseline metrics ingestion before expanding AI autonomy",
      },
      "Connexus",
    );
    assert.match(overview.headlineSegments.map((s) => s.text).join(""), /Connexus runs scaled agile/i);
    assert.equal(overview.bullets.length, 3);
    assert.match(overview.bullets[0]!, /Recommend-only/i);
    assert.match(overview.bullets[1]!, /64%/);
    assert.match(overview.bullets[2]!, /Connect metrics/i);
  });
});
