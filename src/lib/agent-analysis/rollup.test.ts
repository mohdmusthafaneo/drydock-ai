import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rollupGovernance, rollupProductivity } from "./rollup";

describe("rollupProductivity", () => {
  it("merges contributors and sums commits across repos", () => {
    const now = new Date("2026-07-31T12:00:00Z");
    const older = new Date("2026-07-30T12:00:00Z");
    const rollup = rollupProductivity(
      [
        {
          id: "r1",
          analyzedAt: now,
          status: "VERIFIED",
          repositoryName: "acme/api",
          branch: "main",
          headlineTotalCommits: 10,
          headlineFilesTouched: 5,
          headlinePrsMerged: 2,
          headlineFeatFixRatio: 1,
          tlDr: "api ok",
          strongestSignals: ["consistent_weekly_volume"],
          weakestSignals: [],
          contributors: [
            { authorName: "Ada", commits: 6, sharePct: 60, net: 100, rank: 1 },
            { authorName: "Bob", commits: 4, sharePct: 40, net: 50, rank: 2 },
          ],
          weeklyVolume: [{ isoWeek: "2026-W30", commits: 10 }],
          commitTypeBreakdown: [
            { commitType: "feat", count: 6, sharePct: 60 },
            { commitType: "fix", count: 4, sharePct: 40 },
          ],
        },
        {
          id: "r2",
          analyzedAt: older,
          status: "VERIFIED",
          repositoryName: "acme/web",
          branch: "main",
          headlineTotalCommits: 20,
          headlineFilesTouched: 8,
          headlinePrsMerged: 3,
          headlineFeatFixRatio: 2,
          tlDr: "web ok",
          strongestSignals: ["consistent_weekly_volume"],
          weakestSignals: ["low_pr_review_coverage"],
          contributors: [
            { authorName: "Ada", commits: 10, sharePct: 50, net: 200, rank: 1 },
            { authorName: "Cara", commits: 10, sharePct: 50, net: 80, rank: 2 },
          ],
          weeklyVolume: [{ isoWeek: "2026-W30", commits: 20 }],
          commitTypeBreakdown: [
            { commitType: "feat", count: 14, sharePct: 70 },
            { commitType: "fix", count: 6, sharePct: 30 },
          ],
        },
      ] as never,
      "org1",
    );

    assert.ok(rollup);
    assert.equal(rollup.repositoryCount, 2);
    assert.deepEqual(rollup.repositories, ["acme/api", "acme/web"]);
    assert.equal(rollup.totalCommits, 30);
    assert.equal(rollup.filesTouched, 13);
    assert.equal(rollup.prsMerged, 5);
    assert.equal(rollup.analyzedAt, older.toISOString());
    assert.equal(rollup.contributors[0]?.authorName, "Ada");
    assert.equal(rollup.contributors[0]?.commits, 16);
    assert.equal(rollup.weeklyVolume[0]?.commits, 30);
    assert.equal(rollup.featFixRatio, 20 / 10);
    assert.ok(rollup.weakestSignals.includes("low_pr_review_coverage"));
  });
});

describe("rollupGovernance", () => {
  it("takes headline risk from the highest-risk repo and prefixes paths", () => {
    const now = new Date("2026-07-31T12:00:00Z");
    const older = new Date("2026-07-30T12:00:00Z");
    const rollup = rollupGovernance(
      [
        {
          id: "g1",
          analyzedAt: now,
          status: "VERIFIED",
          repositoryName: "acme/api",
          revspec: "HEAD~20..HEAD",
          headlineRiskScore: 2,
          headlineProbability: 0.1,
          headlineRiskLevel: "low",
          headlineReviewPriority: "low",
          headlineSummary: "api fine",
          headlineWorstFilePath: "src/a.ts",
          headlineFindingsCount: 1,
          headlineDeadCodeFindingsCount: 1,
          worstFiles: [
            {
              rank: 1,
              filePath: "src/a.ts",
              score: 8,
              maxCcn: 3,
              hasTestFile: true,
            },
          ],
          riskDrivers: [{ rank: 1, label: "small_change", contribution: 0.1 }],
          deadCodeFindings: [
            {
              rank: 1,
              kind: "unused_export",
              filePath: "src/old.ts",
              reason: "unused",
              cleanupReady: true,
            },
          ],
        },
        {
          id: "g2",
          analyzedAt: older,
          status: "VERIFIED",
          repositoryName: "acme/web",
          revspec: "HEAD~20..HEAD",
          headlineRiskScore: 9,
          headlineProbability: 0.8,
          headlineRiskLevel: "high",
          headlineReviewPriority: "high",
          headlineSummary: "web risky",
          headlineWorstFilePath: "src/b.ts",
          headlineFindingsCount: 4,
          headlineDeadCodeFindingsCount: 2,
          worstFiles: [
            {
              rank: 1,
              filePath: "src/b.ts",
              score: 2,
              maxCcn: 20,
              hasTestFile: false,
            },
          ],
          riskDrivers: [
            { rank: 1, label: "lines_changed_above_baseline", contribution: 1.5 },
          ],
          deadCodeFindings: [],
        },
      ] as never,
      "org1",
    );

    assert.ok(rollup);
    assert.equal(rollup.repositoryCount, 2);
    assert.equal(rollup.repositoryName, "acme/web");
    assert.equal(rollup.riskScore, 9);
    assert.equal(rollup.riskLevel, "high");
    assert.equal(rollup.findingsCount, 5);
    assert.equal(rollup.deadCodeCount, 3);
    assert.equal(rollup.riskDrivers[0]?.label, "lines_changed_above_baseline");
    assert.equal(rollup.worstFiles[0]?.filePath, "acme/web/src/b.ts");
    assert.equal(rollup.analyzedAt, older.toISOString());
  });
});

describe("expandRepoNameAliases", () => {
  it("includes bare names for legacy run matching", async () => {
    const { expandRepoNameAliases } = await import("./rollup");
    const aliases = expandRepoNameAliases([
      "Connexus-inc/connexus-web-api",
      "Connexus-inc/connexus-web-client",
    ]);
    assert.ok(aliases.includes("Connexus-inc/connexus-web-api"));
    assert.ok(aliases.includes("connexus-web-api"));
    assert.ok(aliases.includes("connexus-web-client"));
  });
});
