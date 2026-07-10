import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nameMatchScore } from "./nameMatch";
import { dateSignalScore, parseEvidenceDate } from "./dateSignal";
import { keywordSignalScore } from "./keywordSignal";
import { hasDirectKeyMatch, assignTier } from "./matchScore";
import { redactSecrets } from "./redactSecrets";
import { runEvidencePipeline } from "./pipeline";

describe("nameMatchScore", () => {
  it("matches exact and format-drift names", () => {
    assert.equal(nameMatchScore("Rakhesh J", null, "Rakhesh J"), 1);
    assert.ok(nameMatchScore("rakhesh.j", null, "Rakhesh J") >= 0.65);
    assert.ok(nameMatchScore("rameshpr", "rameshpr@x.com", "Ramesh P R") >= 0.5);
  });
});

describe("dateSignalScore", () => {
  it("parses Jira offsets without colon", () => {
    const d = parseEvidenceDate("2026-04-01T10:00:00+0530");
    assert.ok(d);
  });

  it("scores in-window commits as 1", () => {
    const score = dateSignalScore("2026-04-10T12:00:00Z", {
      createdAt: "2026-04-01T00:00:00Z",
      resolvedAt: "2026-04-15T00:00:00Z",
    });
    assert.equal(score, 1);
  });
});

describe("keyword + direct key", () => {
  it("detects CX-#### in subject", () => {
    assert.equal(
      hasDirectKeyMatch("CX-3321", "Merge fix/cx-3321 into dev", ""),
      true,
    );
  });

  it("scores overlapping keywords", () => {
    const score = keywordSignalScore(
      "Unable to delete contract template from client account",
      "fix: doc template delete for client user",
    );
    assert.ok(score > 0);
  });
});

describe("redactSecrets", () => {
  it("masks bearer tokens and JWTs", () => {
    const out = redactSecrets(
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig and more",
    );
    assert.match(out, /REDACTED/);
    assert.doesNotMatch(out, /eyJhbGci/);
  });
});

describe("runEvidencePipeline", () => {
  it("marks direct key matches and best guess", async () => {
    const result = await runEvidencePipeline({
      tickets: [
        {
          jiraKey: "CX-100",
          projectKey: "CX",
          summary: "Fix login",
          assigneeName: "Ada Lovelace",
          createdAt: "2026-01-01T00:00:00Z",
          resolvedAt: "2026-01-10T00:00:00Z",
        },
      ],
      commits: [
        {
          sha: "abc",
          repoFullName: "acme/app",
          primaryBranch: "dev",
          authorName: "Ada Lovelace",
          commitDate: "2026-01-05T00:00:00Z",
          subject: "fix: CX-100 login redirect",
          body: "",
        },
      ],
    });

    assert.equal(result.directCount, 1);
    assert.equal(result.candidates[0]?.tier, "direct");
    assert.equal(result.candidates[0]?.isBestGuess, true);
    assert.equal(assignTier(
      { authorScore: 1, dateScore: 1, keywordScore: 0.5, keyrefScore: 0, codeSimScore: 0 },
      0.9,
      { direct: true },
    ), "direct");
  });
});
