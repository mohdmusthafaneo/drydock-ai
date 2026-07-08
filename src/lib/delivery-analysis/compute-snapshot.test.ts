import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeDeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/compute-snapshot";
import type { JiraDeliverySnapshot } from "@/lib/jira-meta";

const jiraSnapshot: JiraDeliverySnapshot = {
  syncedAt: new Date().toISOString(),
  projects: [
    {
      key: "CX",
      name: "Connexus",
      openIssues: 200,
      blockedCount: 30,
      overdueCount: 10,
      bugsOpen: 192,
      unassignedCount: 0,
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
      },
    },
  ],
};

describe("computeDeliveryAnalysisSnapshot — release-scoped KPIs", () => {
  it("uses sprint scope metrics when releaseTracking is sprint", () => {
    const result = computeDeliveryAnalysisSnapshot({
      projects: [
        {
          key: "CX",
          name: "Connexus",
          healthScore: 70,
          openIssues: 200,
          blockedCount: 30,
          overdueCount: 10,
          bugsOpen: 192,
          versions: [],
          sprint: {
            name: "Sprint 35",
            state: "active",
            done: 49,
            committed: 74,
            pct: 66,
            sprintId: 807,
          },
        },
      ],
      filters: { projectKey: null, riskFocus: "all", range: "30d", compare: "previous_sync" },
      siteUrl: "",
      generatedAt: jiraSnapshot.syncedAt,
      signals: [],
      gaps: [],
      trend: [],
      jiraSnapshot,
      releaseTracking: "sprint",
    });

    assert.equal(result.kpis.blocked, 2);
    assert.equal(result.kpis.bugsOpen, 3);
    assert.equal(result.kpis.openWork, 25);
    assert.equal(result.kpis.scopeLabel, "Sprint 35");
    assert.equal(result.kpis.scopeMode, "sprint");
  });
});
