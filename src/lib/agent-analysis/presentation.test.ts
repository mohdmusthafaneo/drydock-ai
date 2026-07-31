import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentAnalysisClaims } from "./claims";
import {
  buildCodeHealthPageView,
  buildDevOpsPageView,
  buildProductivityPageView,
  buildQaPageView,
  clusterFindingsByCheck,
  fileBasename,
  humanizeRevspec,
  humanizeSignalLabel,
} from "./presentation";
import type {
  LatestDevOpsRunSummary,
  LatestGovernanceRunSummary,
  LatestProductivityRunSummary,
  LatestQaRunSummary,
} from "./types";

function qaRun(partial: Partial<LatestQaRunSummary> = {}): LatestQaRunSummary {
  return {
    id: "qa1",
    analyzedAt: new Date().toISOString(),
    status: "COMPLETED",
    projectKeys: ["AIDOS"],
    openBugs: 0,
    blocked: 0,
    open: 0,
    done: 10,
    evidenceCount: 0,
    evidence: [],
    ...partial,
  };
}

function devopsRun(partial: Partial<LatestDevOpsRunSummary> = {}): LatestDevOpsRunSummary {
  return {
    id: "d1",
    analyzedAt: new Date().toISOString(),
    status: "COMPLETED",
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/aidos",
    resourcesCount: 100,
    findingsCount: 0,
    warningsCount: 0,
    regionsCount: 3,
    durationMs: 1000,
    bySeverity: [],
    byResourceType: [{ resourceType: "ec2", count: 10 }],
    topFindings: [],
    warnings: [],
    ...partial,
  };
}

function govRun(partial: Partial<LatestGovernanceRunSummary> = {}): LatestGovernanceRunSummary {
  return {
    id: "g1",
    analyzedAt: new Date().toISOString(),
    status: "COMPLETED",
    repositoryName: "connexus-web-api",
    revspec: "HEAD~20..HEAD",
    riskScore: 3,
    probability: 0.2,
    riskLevel: "low",
    reviewPriority: "low",
    summary: "level=low · score=3 · percentile=10",
    worstFilePath: "src/services/billing/invoice.ts",
    findingsCount: 2,
    deadCodeCount: 1,
    worstFiles: [
      {
        rank: 1,
        filePath: "src/services/billing/invoice.ts",
        score: 4,
        maxCcn: 12,
        hasTestFile: false,
      },
    ],
    riskDrivers: [{ rank: 1, label: "lines_changed_above_baseline", contribution: 1.2 }],
    deadCode: [
      {
        rank: 1,
        kind: "unused_export",
        filePath: "src/legacy/old.ts",
        reason: "unused",
        cleanupReady: true,
      },
    ],
    repositoryCount: 1,
    repositories: ["connexus-web-api"],
    ...partial,
  };
}

function prodRun(
  partial: Partial<LatestProductivityRunSummary> = {},
): LatestProductivityRunSummary {
  return {
    id: "p1",
    analyzedAt: new Date().toISOString(),
    status: "COMPLETED",
    repositoryName: "connexus-web-api",
    branch: "main",
    totalCommits: 40,
    filesTouched: 120,
    prsMerged: 8,
    featFixRatio: 1.5,
    tlDr: "Steady cadence",
    strongestSignals: ["consistent_weekly_volume"],
    weakestSignals: [],
    contributors: [
      { authorName: "Ada", commits: 16, sharePct: 40, net: 200, rank: 1 },
      { authorName: "Bob", commits: 14, sharePct: 35, net: 100, rank: 2 },
    ],
    weeklyVolume: [
      { isoWeek: "2026-W01", commits: 3 },
      { isoWeek: "2026-W02", commits: 5 },
    ],
    commitTypes: [
      { commitType: "feat", count: 20, sharePct: 50 },
      { commitType: "fix", count: 10, sharePct: 25 },
    ],
    repositoryCount: 1,
    repositories: ["connexus-web-api"],
    ...partial,
  };
}

describe("agent-analysis presentation helpers", () => {
  it("humanizes revspecs to last N commits", () => {
    assert.equal(humanizeRevspec("HEAD~20..HEAD"), "last 20 commits");
    assert.equal(humanizeRevspec("origin/main~5..HEAD"), "last 5 commits");
  });

  it("humanizes snake_case signal labels", () => {
    assert.equal(humanizeSignalLabel("lines_changed_above_baseline"), "Lines changed above baseline");
    assert.equal(humanizeSignalLabel("bus-factor"), "Bus factor");
  });

  it("extracts file basenames", () => {
    assert.equal(fileBasename("src/services/billing/invoice.ts"), "invoice.ts");
  });

  it("clusters findings by checkId", () => {
    const clustered = clusterFindingsByCheck([
      {
        id: "1",
        rank: 1,
        checkId: "sg-ssh-open",
        severity: "CRITICAL",
        title: "SSH open to the internet",
        description: "port 22",
        recommendation: "Restrict SSH",
        resourceType: "sg",
        resourceRef: "sg-aaa",
      },
      {
        id: "2",
        rank: 2,
        checkId: "sg-ssh-open",
        severity: "CRITICAL",
        title: "SSH open to the internet",
        description: "port 22",
        recommendation: "Restrict SSH",
        resourceType: "sg",
        resourceRef: "sg-bbb",
      },
      {
        id: "3",
        rank: 3,
        checkId: "s3-public",
        severity: "HIGH",
        title: "Public S3 bucket",
        description: "acl",
        recommendation: "Block public access",
        resourceType: "s3",
        resourceRef: "bucket-1",
      },
    ]);

    assert.equal(clustered.length, 2);
    assert.equal(clustered[0].checkId, "sg-ssh-open");
    assert.equal(clustered[0].count, 2);
    assert.deepEqual(clustered[0].resourceRefs, ["sg-aaa", "sg-bbb"]);
  });

  it("sanitizes sg- ids and public CIDRs from finding copy", () => {
    const clustered = clusterFindingsByCheck([
      {
        id: "1",
        rank: 1,
        checkId: "sg-open",
        severity: "CRITICAL",
        title: "Security group open",
        description:
          "Security group launch-wizard-1 (sg-0040d0ca5a61a2262) allows inbound from 0.0.0.0/0",
        recommendation: "Restrict sg-0040d0ca5a61a2262",
        resourceType: "sg",
        resourceRef: "sg-0040d0ca5a61a2262",
      },
    ]);
    assert.ok(!clustered[0].description.includes("sg-"));
    assert.match(clustered[0].description, /public internet/i);
  });
});

describe("buildQaPageView", () => {
  it("returns awaiting-data view for null run", () => {
    const view = buildQaPageView(null);
    assert.equal(view.hero.verdict, "neutral");
    assert.match(view.hero.headline, /no qa scan/i);
    assert.equal(view.highlights.length, 0);
  });

  it("leads with blocked and drops done from highlights", () => {
    const run = qaRun({ blocked: 30, openBugs: 12, open: 80, done: 200 });
    const view = buildQaPageView(run);
    assert.equal(view.hero.verdict, "risk");
    assert.match(view.hero.verdictLabel, /30 blocked/);
    assert.ok(view.highlights.every((h) => h.id !== "done"));
    assert.ok(view.highlights.some((h) => h.id === "blocked"));
  });

  it("agrees with claims.ts verdict wording", () => {
    const run = qaRun({ blocked: 5, openBugs: 10, open: 20 });
    const view = buildQaPageView(run);
    const claim = buildAgentAnalysisClaims({
      qa: run,
      devops: null,
      governance: null,
      productivity: null,
      freshness: [],
    })[0];
    assert.equal(view.hero.verdict, claim.verdict);
    assert.equal(view.hero.verdictLabel, claim.verdictLabel);
  });
});

describe("buildDevOpsPageView", () => {
  it("merges critical cloud findings into a risk hero", () => {
    const run = devopsRun({
      findingsCount: 35,
      bySeverity: [
        { severity: "CRITICAL", count: 35 },
        { severity: "HIGH", count: 0 },
      ],
      topFindings: [
        {
          id: "1",
          rank: 1,
          checkId: "sg-ssh-open",
          severity: "CRITICAL",
          title: "SSH open to the internet",
          description: "port 22",
          recommendation: "Restrict SSH to known CIDRs",
          resourceType: "sg",
          resourceRef: "sg-1",
        },
      ],
    });
    const view = buildDevOpsPageView(run, {
      degradedDeployments: 0,
      rollbackPending: 0,
      deploymentEventCount: 0,
    });
    assert.equal(view.hero.verdict, "risk");
    assert.match(view.hero.verdictLabel, /35 critical/);
    assert.equal(view.clusteredFindings[0].count, 1);

    const claim = buildAgentAnalysisClaims({
      qa: null,
      devops: run,
      governance: null,
      productivity: null,
      freshness: [],
    })[0];
    assert.equal(view.hero.verdict, claim.verdict);
    assert.equal(view.hero.verdictLabel, claim.verdictLabel);
  });

  it("prefers deployment rollback when worse than clean cloud", () => {
    const run = devopsRun({ findingsCount: 0, bySeverity: [] });
    const view = buildDevOpsPageView(run, {
      degradedDeployments: 0,
      rollbackPending: 2,
      deploymentEventCount: 5,
    });
    assert.equal(view.hero.verdict, "risk");
    assert.match(view.hero.headline, /rollback/i);
  });
});

describe("buildCodeHealthPageView", () => {
  it("humanizes revspec and risk drivers; keeps raw summary as notes", () => {
    const view = buildCodeHealthPageView(govRun({ riskScore: 10, riskLevel: "high" }));
    assert.equal(view.hero.verdict, "risk");
    assert.match(view.scope, /last 20 commits/);
    assert.equal(view.riskDrivers[0].label, "Lines changed above baseline");
    assert.equal(view.topHotspots[0].basename, "invoice.ts");
    assert.equal(view.agentNotes, "level=low · score=3 · percentile=10");
    assert.ok(!view.hero.headline.includes("percentile"));
    assert.equal(view.cleanupReadyCount, 1);
  });
});

describe("buildProductivityPageView", () => {
  it("leads with bus factor and humanizes signals", () => {
    const run = prodRun({
      contributors: [{ authorName: "Ada", commits: 30, sharePct: 75, net: 500, rank: 1 }],
      weakestSignals: ["low_pr_review_coverage"],
      strongestSignals: ["consistent_weekly_volume"],
    });
    const view = buildProductivityPageView(run);
    assert.equal(view.hero.verdictLabel, "Bus factor");
    assert.match(view.hero.headline, /75%/);
    assert.equal(view.strongestSignals[0], "Consistent weekly volume");
    assert.equal(view.weakestSignals[0], "Low pr review coverage");
    assert.ok(view.highlights.every((h) => h.id !== "net"));
  });
});
