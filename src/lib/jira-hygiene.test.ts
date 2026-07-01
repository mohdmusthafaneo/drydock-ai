import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessJiraHygiene,
  assessPortfolioJiraHygiene,
  applyHygieneScoreDiscount,
} from "@/lib/jira-hygiene";
import type { JiraDeliverySnapshot } from "@/lib/jira-meta";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";

const freshSyncedAt = new Date().toISOString();

function baseProject(
  overrides: Partial<JiraDeliverySnapshot["projects"][number]> = {},
): JiraDeliverySnapshot["projects"][number] {
  return {
    key: "ACME",
    name: "Acme",
    openIssues: 100,
    blockedCount: 2,
    overdueCount: 5,
    bugsOpen: 3,
    unassignedCount: 10,
    versions: [],
    board: { id: 1, name: "Acme board", type: "scrum" },
    activeSprint: {
      id: 10,
      name: "Sprint 42",
      state: "active",
      committed: 20,
      done: 12,
    },
    ...overrides,
  };
}

const scrumMapping: NonNullable<ToolchainMapping["jira"]> = {
  methodology: "scrum",
  boardType: "scrum",
  usesSprints: true,
  releaseTracking: "fixVersion",
  blockedStatusName: "Blocked",
  bugIssueType: "Bug",
  doneStatusCategory: "Done",
};

describe("assessJiraHygiene", () => {
  it("reports good hygiene for well-maintained board", () => {
    const result = assessJiraHygiene({
      project: baseProject(),
      mapping: scrumMapping,
      snapshotSyncedAt: freshSyncedAt,
    });

    assert.equal(result.grade, "good");
    assert.equal(result.degradesTrust, false);
    assert.ok(result.score >= 75);
  });

  it("degrades trust on high unassigned ratio and stale sync", () => {
    const staleAt = new Date(Date.now() - 100 * 3600000).toISOString();
    const result = assessJiraHygiene({
      project: baseProject({
        unassignedCount: 50,
        openIssues: 100,
      }),
      mapping: scrumMapping,
      snapshotSyncedAt: staleAt,
    });

    assert.equal(result.degradesTrust, true);
    assert.ok(result.findings.some((f) => f.id === "high-unassigned"));
    assert.ok(result.findings.some((f) => f.id === "stale-sync"));
  });

  it("flags fixVersion not used when versions exist but untagged", () => {
    const result = assessJiraHygiene({
      project: baseProject({
        versions: [
          { id: "1", name: "v2.0", released: false, openIssuesInVersion: 0 },
        ],
      }),
      mapping: scrumMapping,
      snapshotSyncedAt: freshSyncedAt,
    });

    assert.ok(result.findings.some((f) => f.id === "fixversion-not-used"));
  });
});

describe("assessPortfolioJiraHygiene", () => {
  it("uses min project score as portfolio score", () => {
    const snapshot: JiraDeliverySnapshot = {
      syncedAt: freshSyncedAt,
      projects: [
        baseProject({ key: "GOOD", name: "Good", unassignedCount: 5 }),
        baseProject({
          key: "BAD",
          name: "Bad",
          unassignedCount: 60,
          openIssues: 100,
        }),
      ],
    };

    const portfolio = assessPortfolioJiraHygiene(snapshot, { jira: scrumMapping });
    const badScore = portfolio.byProject.BAD!.score;
    const goodScore = portfolio.byProject.GOOD!.score;

    assert.equal(portfolio.portfolioScore, badScore);
    assert.ok(goodScore > badScore);
    assert.equal(portfolio.worstProject?.key, "BAD");
  });

  it("applies per-project mapping overrides", () => {
    const snapshot: JiraDeliverySnapshot = {
      syncedAt: freshSyncedAt,
      projects: [
        baseProject({
          key: "KAN",
          name: "Kanban",
          board: { id: 2, name: "Kanban", type: "kanban" },
          activeSprint: undefined,
        }),
      ],
    };

    const mapping: ToolchainMapping = {
      jira: {
        ...scrumMapping,
        projectOverrides: {
          KAN: { usesSprints: false, methodology: "kanban", boardType: "kanban" },
        },
      },
    };

    const result = assessPortfolioJiraHygiene(snapshot, mapping);
    assert.ok(!result.byProject.KAN!.findings.some((f) => f.id === "scrum-no-sprint"));
  });
});

describe("applyHygieneScoreDiscount", () => {
  it("caps score when hygiene degrades trust", () => {
    assert.equal(
      applyHygieneScoreDiscount(82, { degradesTrust: true, portfolioScore: 55 }),
      65,
    );
    assert.equal(
      applyHygieneScoreDiscount(82, { degradesTrust: true, portfolioScore: 30 }),
      55,
    );
    assert.equal(applyHygieneScoreDiscount(82, { degradesTrust: false }), 82);
  });
});
