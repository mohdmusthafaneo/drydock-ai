import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveReleaseScope,
  scopedMetricsFromSnapshot,
  aggregateOrgScopedMetrics,
} from "@/lib/release-scope";
import type { JiraDeliverySnapshot } from "@/lib/jira-meta";

function makeSnapshot(
  projects: JiraDeliverySnapshot["projects"],
): JiraDeliverySnapshot {
  return { syncedAt: new Date().toISOString(), projects };
}

describe("resolveReleaseScope", () => {
  const snapshot = makeSnapshot([
    {
      key: "CX",
      name: "Connexus",
      openIssues: 200,
      blockedCount: 30,
      overdueCount: 15,
      bugsOpen: 192,
      unassignedCount: 5,
      versions: [{ id: "1", name: "v2.0", released: false }],
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
        reopenedCount: 0,
        spilloverCount: 11,
      },
    },
  ]);

  it("prefers jiraSprintId over project backlog", () => {
    const scope = resolveReleaseScope({
      snapshot,
      releaseTracking: "sprint",
      jiraSprintId: 807,
    });
    assert.equal(scope?.mode, "sprint");
    assert.equal(scope?.sprintId, 807);

    const metrics = scopedMetricsFromSnapshot(scope!, snapshot);
    assert.equal(metrics.blockedCount, 2);
    assert.equal(metrics.bugsOpen, 3);
    assert.equal(metrics.openIssues, 25);
    assert.notEqual(metrics.blockedCount, 30);
  });

  it("resolves fix version scope", () => {
    const scope = resolveReleaseScope({
      snapshot,
      releaseTracking: "fixVersion",
      jiraFixVersion: "v2.0",
      projectKey: "CX",
    });
    assert.equal(scope?.mode, "fixVersion");
    assert.equal(scope?.versionName, "v2.0");
  });
});

describe("aggregateOrgScopedMetrics", () => {
  it("sums sprint-scoped metrics for org view", () => {
    const snapshot = makeSnapshot([
      {
        key: "CX",
        name: "Connexus",
        openIssues: 200,
        blockedCount: 30,
        overdueCount: 0,
        bugsOpen: 192,
        unassignedCount: 0,
        versions: [],
        activeSprint: {
          id: 807,
          name: "Sprint 35",
          state: "active",
          committed: 74,
          done: 49,
          blockedCount: 2,
          bugsOpen: 3,
        },
      },
    ]);

    const agg = aggregateOrgScopedMetrics(snapshot, "sprint");
    assert.equal(agg.blockedCount, 2);
    assert.equal(agg.bugsOpen, 3);
    assert.equal(agg.scopeLabel, "Sprint 35");
    assert.equal(agg.sprintCompletionPct, 66);
  });
});
