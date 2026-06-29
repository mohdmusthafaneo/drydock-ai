import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDiffExcerpt,
  extractJiraKeys,
  extractJiraKeysFromTexts,
} from "@/lib/code-analysis/jira-link";

describe("extractJiraKeys", () => {
  it("finds keys for configured projects only", () => {
    const keys = extractJiraKeys(
      "feat(AIDOS-42): link to PROJ-99 and aidos-7",
      ["AIDOS", "WEB"],
    );
    assert.deepEqual(keys, ["AIDOS-42", "AIDOS-7"]);
  });

  it("returns empty when no project keys configured", () => {
    assert.deepEqual(extractJiraKeys("AIDOS-1", []), []);
  });
});

describe("extractJiraKeysFromTexts", () => {
  it("deduplicates across sources", () => {
    const keys = extractJiraKeysFromTexts(
      ["AIDOS-1", "branch/feature/AIDOS-2"],
      ["AIDOS"],
    );
    assert.deepEqual(keys, ["AIDOS-1", "AIDOS-2"]);
  });
});

describe("buildDiffExcerpt", () => {
  it("truncates large patches", () => {
    const excerpt = buildDiffExcerpt(
      [
        { filename: "a.ts", patch: "+".repeat(5000), additions: 100 },
        { filename: "b.ts", patch: "+line", additions: 50 },
      ],
      200,
    );
    assert.ok(excerpt.length <= 220);
    assert.match(excerpt, /a\.ts/);
  });
});
