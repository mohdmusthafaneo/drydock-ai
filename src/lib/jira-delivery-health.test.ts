import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeJiraDeliveryHealth,
  analyzePortfolioDeliveryHealth,
} from "@/lib/jira-delivery-health";
import type { JiraDeliverySnapshot } from "@/lib/jira-meta";

function snapshot(
  projects: JiraDeliverySnapshot["projects"],
): JiraDeliverySnapshot {
  return { syncedAt: new Date().toISOString(), projects };
}

describe("analyzePortfolioDeliveryHealth — reopened and spillover", () => {
  it("emits reopened-cluster and spillover signals with gaps when counts are positive", () => {
    const health = analyzePortfolioDeliveryHealth({
      snapshot: snapshot([
        {
          key: "CX",
          name: "Connexus",
          openIssues: 20,
          blockedCount: 0,
          overdueCount: 0,
          reopenedCount: 3,
          spilloverCount: 4,
          bugsOpen: 0,
          unassignedCount: 0,
          versions: [],
        },
      ]),
    });

    const reopened = health.signals.find((s) => s.id === "reopened-cluster");
    const spillover = health.signals.find((s) => s.id === "spillover");

    assert.ok(reopened);
    assert.equal(reopened?.category, "quality");
    assert.equal(reopened?.severity, "warning");
    assert.ok(reopened?.value.includes("3"));

    assert.ok(spillover);
    assert.equal(spillover?.category, "schedule");
    assert.equal(spillover?.severity, "warning");
    assert.ok(spillover?.value.includes("4"));

    assert.ok(health.gaps.some((g) => g.gap.includes("reopened")));
    assert.ok(health.gaps.some((g) => g.gap.includes("spilled over")));
  });

  it("aggregates reopened and spillover across portfolio", () => {
    const health = analyzePortfolioDeliveryHealth({
      snapshot: snapshot([
        {
          key: "A",
          name: "Alpha",
          openIssues: 10,
          blockedCount: 0,
          overdueCount: 0,
          reopenedCount: 2,
          spilloverCount: 1,
          bugsOpen: 0,
          unassignedCount: 0,
          versions: [],
        },
        {
          key: "B",
          name: "Beta",
          openIssues: 8,
          blockedCount: 0,
          overdueCount: 0,
          reopenedCount: 1,
          spilloverCount: 2,
          bugsOpen: 0,
          unassignedCount: 0,
          versions: [],
        },
      ]),
    });

    const reopened = health.signals.find((s) => s.id === "reopened-cluster");
    const spillover = health.signals.find((s) => s.id === "spillover");

    assert.ok(reopened?.value.includes("3"));
    assert.ok(spillover?.value.includes("3"));
  });

  it("reports info severity when counts are zero", () => {
    const health = analyzePortfolioDeliveryHealth({
      snapshot: snapshot([
        {
          key: "CX",
          name: "Connexus",
          openIssues: 5,
          blockedCount: 0,
          overdueCount: 0,
          bugsOpen: 0,
          unassignedCount: 0,
          versions: [],
        },
      ]),
    });

    assert.equal(
      health.signals.find((s) => s.id === "reopened-cluster")?.severity,
      "info",
    );
    assert.equal(health.signals.find((s) => s.id === "spillover")?.severity, "info");
    assert.equal(health.gaps.filter((g) => g.area === "Sprint").length, 0);
  });
});

describe("analyzeJiraDeliveryHealth — per-release reopened and spillover", () => {
  it("includes reopened and spillover signals and gaps for release scope", () => {
    const health = analyzeJiraDeliveryHealth({
      snapshot: snapshot([
        {
          key: "REL",
          name: "Release",
          openIssues: 12,
          blockedCount: 0,
          overdueCount: 0,
          reopenedCount: 2,
          spilloverCount: 3,
          bugsOpen: 0,
          unassignedCount: 0,
          versions: [],
        },
      ]),
      releaseName: "R1",
    });

    assert.ok(health.signals.some((s) => s.id === "jira-reopened"));
    assert.ok(health.signals.some((s) => s.id === "jira-spillover"));
    assert.ok(health.gaps.some((g) => g.gap.includes("reopened")));
    assert.ok(health.gaps.some((g) => g.gap.includes("spilled over")));
  });

  it("uses sprint-scoped metrics instead of project backlog when jiraSprintId is set", () => {
    const snap = snapshot([
      {
        key: "CX",
        name: "Connexus",
        openIssues: 200,
        blockedCount: 30,
        overdueCount: 15,
        bugsOpen: 192,
        unassignedCount: 5,
        versions: [],
        activeSprint: {
          id: 807,
          name: "Sprint 35",
          state: "active",
          committed: 74,
          done: 49,
          openIssues: 25,
          blockedCount: 2,
          overdueCount: 1,
          bugsOpen: 3,
          spilloverCount: 11,
        },
      },
    ]);

    const health = analyzeJiraDeliveryHealth({
      snapshot: snap,
      releaseName: "Sprint 35",
      jiraSprintId: 807,
      mapping: {
        methodology: "scrum",
        usesSprints: true,
        releaseTracking: "sprint",
        blockedStatusName: "Blocked",
        bugIssueType: "Bug",
        doneStatusCategory: "Done",
      },
    });

    const projectWide = analyzeJiraDeliveryHealth({
      snapshot: snap,
      releaseName: "Unrelated release",
      mapping: {
        methodology: "scrum",
        usesSprints: true,
        releaseTracking: "fixVersion",
        blockedStatusName: "Blocked",
        bugIssueType: "Bug",
        doneStatusCategory: "Done",
      },
    });

    assert.equal(health.releaseScope?.mode, "sprint");
    assert.equal(health.scopeLabel, "Sprint 35");
    const blocked = health.signals.find((s) => s.id === "jira-blocked");
    assert.ok(blocked?.value.includes("2"));
    assert.ok(health.score > projectWide.score, "sprint scope should score higher than project backlog");
    assert.ok(projectWide.signals.find((s) => s.id === "jira-blocked")?.value.includes("30"));
  });
});

describe("analyzePortfolioDeliveryHealth — P2 sprint signals", () => {
  it("emits sprint overdue, QA pipeline, and assignee load signals", () => {
    const health = analyzePortfolioDeliveryHealth({
      snapshot: snapshot([
        {
          key: "CX",
          name: "Connexus",
          openIssues: 25,
          blockedCount: 0,
          overdueCount: 0,
          spilloverCount: 11,
          bugsOpen: 0,
          unassignedCount: 0,
          qaPipelineCount: 13,
          assigneeWorkload: [{ assignee: "Vysakh R J", openCount: 7 }],
          versions: [],
          activeSprint: {
            id: 807,
            name: "Sprint 35",
            state: "active",
            endDate: "2026-06-30",
            committed: 74,
            done: 49,
            daysOverdue: 7,
            qaPipelineCount: 13,
            storyPoints: { committed: 29, done: 0, unestimatedIssues: 69 },
            statusByName: { Done: 49, "Ready for Testing": 9 },
          },
        },
      ]),
    });

    const overdue = health.signals.find((s) => s.id === "sprint-overdue-CX");
    const qa = health.signals.find((s) => s.id === "qa-pipeline-CX");
    const assignee = health.signals.find((s) => s.id === "assignee-load-CX");
    const sprint = health.signals.find((s) => s.id === "sprint-CX");

    assert.ok(overdue?.value.includes("overdue by 7 days"));
    assert.ok(qa?.value.includes("13"));
    assert.ok(assignee?.value.includes("Vysakh R J"));
    assert.ok(sprint?.value.includes("0/29 SP"));
  });
});
