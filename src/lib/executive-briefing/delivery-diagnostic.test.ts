import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDiagnosticNarrative,
  extractDeliveryDiagnosticFacts,
} from "@/lib/executive-briefing/delivery-diagnostic";

describe("extractDeliveryDiagnosticFacts", () => {
  it("flags crisis-clear + bad shape for low completion, bugs, and spillover", () => {
    const facts = extractDeliveryDiagnosticFacts({
      mapping: { jira: { releaseTracking: "sprint" } } as never,
      deliverySnapshot: {
        generatedAt: new Date().toISOString(),
        projectKeys: ["CX"],
        rangeLabel: "30d",
        kpis: {
          healthScore: 40,
          openWork: 80,
          openWorkDelta: 12,
          blocked: 0,
          overdue: 0,
          spillover: 21,
          bugsOpen: 12,
          sprintCompletionPct: 30,
          scopeMode: "sprint",
          scopeLabel: "Sprint 37",
        },
        riskMix: { blocked: 0, overdue: 0, bugs: 12, otherOpen: 68 },
        trend: [],
        byProject: [],
        versions: [],
        sprints: [
          {
            projectKey: "CX",
            projectName: "Connexus",
            name: "Sprint 37",
            state: "active",
            done: 18,
            committed: 60,
            pct: 30,
          },
        ],
        signals: [],
        gaps: [],
      },
      jiraSnapshot: {
        syncedAt: new Date().toISOString(),
        projects: [
          {
            key: "CX",
            name: "Connexus",
            openIssues: 80,
            blockedCount: 0,
            overdueCount: 0,
            bugsOpen: 203,
            unassignedCount: 0,
            versions: [],
            activeSprint: {
              id: 37,
              name: "Sprint 37",
              state: "active",
              committed: 60,
              done: 18,
              bugsOpen: 12,
              spilloverCount: 21,
              unassignedCount: 0,
              blockedCount: 0,
              overdueCount: 0,
            },
          },
        ],
      },
    });

    assert.equal(facts.crisisClear, true);
    assert.equal(facts.pct, 30);
    assert.equal(facts.bugsInScope, 12);
    assert.equal(facts.bugsOverall, 203);
    assert.equal(facts.spillover, 21);
    assert.ok(facts.shapeIssues.includes("low_completion"));
    assert.ok(facts.shapeIssues.includes("heavy_bugs"));
    assert.ok(facts.shapeIssues.includes("spillover"));
    assert.ok(facts.shapeIssues.includes("rising_open_work"));
  });
});

describe("buildDiagnosticNarrative", () => {
  it("writes crisis-vs-shape diagnostic prose for a weak sprint", () => {
    const facts = extractDeliveryDiagnosticFacts({
      mapping: { jira: { releaseTracking: "sprint" } } as never,
      deliverySnapshot: {
        generatedAt: new Date().toISOString(),
        projectKeys: ["CX"],
        rangeLabel: "30d",
        kpis: {
          healthScore: 40,
          openWork: 80,
          openWorkDelta: 12,
          blocked: 0,
          overdue: 0,
          spillover: 21,
          bugsOpen: 12,
          sprintCompletionPct: 30,
          scopeMode: "sprint",
          scopeLabel: "Sprint 37",
        },
        riskMix: { blocked: 0, overdue: 0, bugs: 12, otherOpen: 68 },
        trend: [],
        byProject: [],
        versions: [],
        sprints: [
          {
            projectKey: "CX",
            projectName: "Connexus",
            name: "Sprint 37",
            state: "active",
            done: 18,
            committed: 60,
            pct: 30,
          },
        ],
        signals: [],
        gaps: [],
      },
      jiraSnapshot: {
        syncedAt: new Date().toISOString(),
        projects: [
          {
            key: "CX",
            name: "Connexus",
            openIssues: 80,
            blockedCount: 0,
            overdueCount: 0,
            bugsOpen: 203,
            unassignedCount: 0,
            versions: [],
            activeSprint: {
              id: 37,
              name: "Sprint 37",
              state: "active",
              committed: 60,
              done: 18,
              bugsOpen: 12,
              spilloverCount: 21,
              unassignedCount: 0,
            },
          },
        ],
      },
    });

    const narrative = buildDiagnosticNarrative({
      orgName: "Connexus",
      headline: [
        { kind: "text", text: "Connexus " },
        { kind: "emphasis", text: "Sprint 37" },
        { kind: "text", text: " — " },
        { kind: "emphasis", text: "30%" },
        { kind: "text", text: " complete, delivery at risk." },
      ],
      healthBand: "at_risk",
      healthVisible: true,
      facts,
    });

    assert.match(narrative, /not in crisis/i);
    assert.match(narrative, /shape is bad/i);
    assert.match(narrative, /too little getting done/i);
    assert.match(narrative, /~30%/);
    assert.match(narrative, /spillover|spilling over|carryover/i);
    const words = narrative.trim().split(/\s+/).length;
    assert.ok(words <= 80, `expected compact narrative, got ${words} words`);
  });

  it("keeps crisis sprints compact with blocked + shape + trajectory", () => {
    const facts = extractDeliveryDiagnosticFacts({
      mapping: { jira: { releaseTracking: "sprint" } } as never,
      deliverySnapshot: {
        generatedAt: new Date().toISOString(),
        projectKeys: ["CX"],
        rangeLabel: "30d",
        kpis: {
          healthScore: 35,
          openWork: 80,
          blocked: 30,
          overdue: 0,
          spillover: 21,
          bugsOpen: 10,
          sprintCompletionPct: 30,
          scopeMode: "sprint",
          scopeLabel: "Sprint 37",
        },
        riskMix: { blocked: 30, overdue: 0, bugs: 10, otherOpen: 40 },
        trend: [],
        byProject: [],
        versions: [],
        sprints: [
          {
            projectKey: "CX",
            projectName: "Connexus",
            name: "Sprint 37",
            state: "active",
            done: 18,
            committed: 60,
            pct: 30,
          },
        ],
        signals: [],
        gaps: [],
      },
      jiraSnapshot: {
        syncedAt: new Date().toISOString(),
        projects: [
          {
            key: "CX",
            name: "Connexus",
            openIssues: 80,
            blockedCount: 30,
            overdueCount: 0,
            bugsOpen: 203,
            unassignedCount: 0,
            versions: [],
            activeSprint: {
              id: 37,
              name: "Sprint 37",
              state: "active",
              committed: 60,
              done: 18,
              bugsOpen: 10,
              spilloverCount: 21,
              unassignedCount: 0,
              blockedCount: 30,
            },
          },
        ],
      },
    });

    const narrative = buildDiagnosticNarrative({
      orgName: "Connexus",
      headline: [
        { kind: "text", text: "Connexus Sprint 37 — 30% complete, delivery at risk." },
      ],
      healthBand: "at_risk",
      healthVisible: true,
      facts,
    });

    assert.match(narrative, /in crisis/i);
    assert.match(narrative, /30 blocked/i);
    assert.match(narrative, /~30%/);
    const words = narrative.trim().split(/\s+/).length;
    assert.ok(words <= 70, `expected half-length narrative, got ${words} words: ${narrative}`);
  });
});
