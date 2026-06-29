import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzePortfolioDeliveryHealth } from "@/lib/jira-delivery-health";
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
    assert.equal(spillover?.category, "sprint");
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
