import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getStoredCodeAnalysisSnapshot,
  snapshotForFilters,
} from "@/lib/code-analysis/sync";
import type {
  CodeAnalysisFilters,
  CodeAnalysisPullRequest,
  StoredCodeAnalysis,
} from "@/lib/code-analysis/types";

function makeStored(overrides: Partial<StoredCodeAnalysis> = {}): StoredCodeAnalysis {
  const mergedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const syncedAt = new Date().toISOString();
  const pr: CodeAnalysisPullRequest = {
    id: "org/repo#1",
    number: 1,
    title: "Add feature",
    repo: "org/repo",
    author: "dev",
    mergedAt,
    url: "https://github.com/org/repo/pull/1",
    linesAdded: 200,
    linesRemoved: 10,
    attribution: "human_only",
    confidence: 90,
    reviewCount: 1,
    reviewers: ["alice"],
    tools: [],
    jiraKeys: ["AIDOS-1"],
  };
  return {
    syncedAt,
    repos: ["org/repo"],
    pullRequests: [pr],
    commits: [],
    ...overrides,
  };
}

describe("getStoredCodeAnalysisSnapshot", () => {
  it("returns null when metadata is null", () => {
    assert.equal(getStoredCodeAnalysisSnapshot(null), null);
  });

  it("returns null when metadata is undefined", () => {
    assert.equal(getStoredCodeAnalysisSnapshot(undefined), null);
  });

  it("returns null when metadata is a non-object string", () => {
    assert.equal(getStoredCodeAnalysisSnapshot("not json"), null);
  });

  it("returns null when metadata has no codeAnalysisSnapshot field", () => {
    assert.equal(getStoredCodeAnalysisSnapshot({ other: "value" }), null);
  });

  it("returns null when codeAnalysisSnapshot is null", () => {
    assert.equal(getStoredCodeAnalysisSnapshot({ codeAnalysisSnapshot: null }), null);
  });

  it("returns the stored snapshot when present", () => {
    const stored = makeStored();
    const meta = { codeAnalysisSnapshot: stored };
    const result = getStoredCodeAnalysisSnapshot(meta);
    assert.equal(result, stored);
  });

  it("accepts a JSON-stringified metadata payload", () => {
    const stored = makeStored();
    const result = getStoredCodeAnalysisSnapshot(
      JSON.stringify({ codeAnalysisSnapshot: stored }),
    );
    assert.ok(result);
    assert.equal(result!.repos[0], "org/repo");
  });
});

describe("snapshotForFilters", () => {
  it("returns a snapshot built from the stored data", () => {
    const stored = makeStored();
    const filters: Partial<CodeAnalysisFilters> = { range: "30d" };
    const snapshot = snapshotForFilters(stored, filters);
    assert.ok(snapshot);
    assert.equal(snapshot.pullRequests.length, 1);
    assert.equal(snapshot.pullRequests[0].number, 1);
  });

  it("uses the requested repos filter as the snapshot scope", () => {
    const stored = makeStored();
    const filters: Partial<CodeAnalysisFilters> = {
      range: "30d",
      repos: ["other/repo"],
    };
    const snapshot = snapshotForFilters(stored, filters);
    assert.deepEqual(snapshot.repos, ["other/repo"]);
    assert.equal(snapshot.pullRequests.length, 0);
  });

  it("handles empty pullRequests and commits lists", () => {
    const stored = makeStored({ pullRequests: [], commits: [] });
    const snapshot = snapshotForFilters(stored, { range: "7d" });
    assert.equal(snapshot.pullRequests.length, 0);
    assert.equal(snapshot.commits.length, 0);
  });

  it("filters pullRequests by author", () => {
    const stored = makeStored();
    const snapshot = snapshotForFilters(stored, {
      range: "30d",
      author: "nobody",
    });
    assert.equal(snapshot.pullRequests.length, 0);
  });
});
