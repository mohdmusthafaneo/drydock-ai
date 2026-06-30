import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectReviewers, countApprovals } from "@/lib/code-analysis/collect-reviewers";

describe("collectReviewers", () => {
  it("returns unique approved reviewer logins", () => {
    const reviewers = collectReviewers([
      { state: "APPROVED", user: { login: "alice" } },
      { state: "APPROVED", user: { login: "bob" } },
      { state: "COMMENTED", user: { login: "carol" } },
    ]);
    assert.deepEqual(reviewers, ["alice", "bob"]);
  });

  it("dedupes re-reviews by login keeping latest approval", () => {
    const reviewers = collectReviewers([
      { state: "APPROVED", user: { login: "alice" } },
      { state: "DISMISSED", user: { login: "alice" } },
      { state: "APPROVED", user: { login: "alice" } },
      { state: "APPROVED", user: { login: "bob" } },
    ]);
    assert.deepEqual(reviewers, ["alice", "bob"]);
  });

  it("ignores dismissed approvals", () => {
    const reviewers = collectReviewers([
      { state: "APPROVED", user: { login: "alice" } },
      { state: "DISMISSED", user: { login: "alice" } },
    ]);
    assert.deepEqual(reviewers, []);
  });

  it("countApprovals counts only APPROVED states", () => {
    assert.equal(
      countApprovals([
        { state: "APPROVED" },
        { state: "APPROVED" },
        { state: "CHANGES_REQUESTED" },
      ]),
      2,
    );
  });
});
