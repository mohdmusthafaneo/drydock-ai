import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeDeliveryHealthScore,
  computeEngineeringDimension,
  scoreToBand,
} from "@/lib/executive-briefing/health-score";
import type { LatestAgentAnalysisBundle } from "@/lib/agent-analysis/types";

describe("scoreToBand", () => {
  it("maps score ranges to band labels", () => {
    assert.equal(scoreToBand(85), "strong");
    assert.equal(scoreToBand(70), "steady");
    assert.equal(scoreToBand(50), "caution");
    assert.equal(scoreToBand(30), "at_risk");
  });
});

describe("computeEngineeringDimension", () => {
  it("returns null when no agent runs exist", () => {
    assert.equal(
      computeEngineeringDimension({
        stats: {
          releaseReadiness: 70,
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
        agentAnalysis: null,
      }),
      null,
    );

    assert.equal(
      computeEngineeringDimension({
        stats: {
          releaseReadiness: 70,
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
        agentAnalysis: {
          qa: null,
          devops: null,
          governance: null,
          productivity: null,
          freshness: [],
        },
      }),
      null,
    );
  });

  it("scores lower as blocked, critical, risk score, and contributor share rise", () => {
    const clean: LatestAgentAnalysisBundle = {
      qa: {
        id: "qa-1",
        analyzedAt: new Date().toISOString(),
        status: "COMPLETED",
        projectKeys: ["ACME"],
        openBugs: 0,
        blocked: 0,
        open: 0,
        done: 10,
        evidenceCount: 0,
        evidence: [],
      },
      devops: {
        id: "dev-1",
        analyzedAt: new Date().toISOString(),
        status: "COMPLETED",
        accountId: "123",
        roleArn: "arn:aws:iam::123:role/x",
        resourcesCount: 10,
        findingsCount: 0,
        warningsCount: 0,
        regionsCount: 1,
        durationMs: 1000,
        bySeverity: [],
        byResourceType: [],
        topFindings: [],
        warnings: [],
      },
      governance: {
        id: "gov-1",
        analyzedAt: new Date().toISOString(),
        status: "COMPLETED",
        repositoryName: "acme/app",
        revspec: "HEAD~5..HEAD",
        riskScore: 1,
        probability: 0.1,
        riskLevel: "low",
        reviewPriority: null,
        summary: null,
        worstFilePath: null,
        findingsCount: 0,
        deadCodeCount: 0,
        worstFiles: [],
        riskDrivers: [],
        deadCode: [],
      },
      productivity: {
        id: "prod-1",
        analyzedAt: new Date().toISOString(),
        status: "COMPLETED",
        repositoryName: "acme/app",
        branch: "main",
        totalCommits: 40,
        filesTouched: 20,
        prsMerged: 5,
        featFixRatio: 1,
        tlDr: "ok",
        strongestSignals: [],
        weakestSignals: [],
        contributors: [{ authorName: "Alice", commits: 12, sharePct: 30, net: 100, rank: 1 }],
        weeklyVolume: [],
        commitTypes: [],
      },
      freshness: [],
    };

    const risky: LatestAgentAnalysisBundle = {
      ...clean,
      qa: { ...clean.qa!, blocked: 30, openBugs: 100, open: 150 },
      devops: {
        ...clean.devops!,
        findingsCount: 40,
        bySeverity: [
          { severity: "CRITICAL", count: 35 },
          { severity: "HIGH", count: 5 },
        ],
      },
      governance: { ...clean.governance!, riskScore: 10, riskLevel: "high" },
      productivity: {
        ...clean.productivity!,
        contributors: [{ authorName: "Alice", commits: 40, sharePct: 55, net: 200, rank: 1 }],
      },
    };

    const baseInput = {
      stats: {
        releaseReadiness: 70,
        openIncidents: 0,
        degradedDeployments: 0,
        errorRate: null,
        p95Latency: null,
        pendingApprovals: 0,
        rollbackPending: 0,
        connectedTools: 1,
        integrationsHealthy: 1,
      },
      hasAssessedRelease: true as const,
    };

    const cleanDim = computeEngineeringDimension({ ...baseInput, agentAnalysis: clean });
    const riskyDim = computeEngineeringDimension({ ...baseInput, agentAnalysis: risky });

    assert.ok(cleanDim);
    assert.ok(riskyDim);
    assert.ok(riskyDim!.score < cleanDim!.score);
    assert.ok(riskyDim!.score < 50);
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
    assert.ok(result.dataGaps.includes("Agent engineering scans not available"));
  });

  it("includes engineering dimension when agent runs exist", () => {
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
      agentAnalysis: {
        qa: {
          id: "qa-1",
          analyzedAt: new Date().toISOString(),
          status: "COMPLETED",
          projectKeys: ["ACME"],
          openBugs: 5,
          blocked: 2,
          open: 10,
          done: 20,
          evidenceCount: 0,
          evidence: [],
        },
        devops: null,
        governance: null,
        productivity: null,
        freshness: [],
      },
    });

    const engineering = result.dimensions.find((d) => d.id === "engineering");
    assert.ok(engineering);
    assert.equal(engineering!.label, "Engineering risk");
    assert.ok(!result.dataGaps.includes("Agent engineering scans not available"));
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
