import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeCompositeRisk,
  fallbackCompletionScore,
} from "@/lib/code-analysis/scoring";
import type { CodeAnalysisPullRequest } from "@/lib/code-analysis/types";

const basePr: CodeAnalysisPullRequest = {
  id: "repo#1",
  number: 1,
  title: "Test",
  repo: "org/repo",
  author: "dev",
  mergedAt: "2026-01-01T00:00:00Z",
  url: "https://example.com",
  linesAdded: 400,
  linesRemoved: 10,
  attribution: "ai_generated",
  confidence: 90,
  reviewCount: 0,
  tools: ["Cursor"],
  jiraKeys: [],
};

describe("fallbackCompletionScore", () => {
  it("returns null when no ticket linked", () => {
    const result = fallbackCompletionScore({ jiraKeys: [], hasDiff: true });
    assert.equal(result.completionScore, null);
    assert.match(result.completionRationale, /no jira ticket/i);
  });
});

describe("computeCompositeRisk", () => {
  it("flags high-risk unreviewed AI PRs", () => {
    const result = computeCompositeRisk(basePr);
    assert.ok(result.riskScore >= 40);
    assert.equal(result.riskLevel, "high");
    assert.ok(result.qualityFlags.includes("no_review"));
  });

  it("returns low risk for human-only PRs", () => {
    const result = computeCompositeRisk({
      ...basePr,
      attribution: "human_only",
      reviewCount: 2,
    });
    assert.equal(result.riskScore, 0);
    assert.equal(result.riskLevel, "low");
  });
});
