import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitNarrativeForEmphasis } from "@/components/executive-briefing/briefing-narrative";

describe("splitNarrativeForEmphasis", () => {
  it("emphasizes numbers and crisis/spillover phrases", () => {
    const parts = splitNarrativeForEmphasis(
      "The sprint is in crisis (30 blocked). Expect ~30% finish with spillover.",
    );
    const emphasized = parts.filter((p) => p.emphasize).map((p) => p.text);
    assert.ok(emphasized.some((t) => /in crisis/i.test(t)));
    assert.ok(emphasized.includes("30"));
    assert.ok(emphasized.includes("~30%"));
    assert.ok(emphasized.some((t) => /spillover/i.test(t)));
    assert.ok(emphasized.some((t) => /blocked/i.test(t)));
  });
});
