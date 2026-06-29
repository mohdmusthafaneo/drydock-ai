import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHeadlineSegmentsFromPlainText,
  ensureHeadlineSegmentSpacing,
  flattenHeadlineSegments,
  hasHeadlineSpacingDefects,
  resolveEnrichedHeadline,
  spacingBetweenSegments,
} from "@/lib/executive-briefing/headline-format";

describe("spacingBetweenSegments", () => {
  it("inserts a space between glued words and numbers", () => {
    assert.equal(
      spacingBetweenSegments({ kind: "text", text: "confidence at" }, { kind: "emphasis", text: "32" }),
      " ",
    );
    assert.equal(
      spacingBetweenSegments({ kind: "text", text: "release" }, { kind: "text", text: "is" }),
      " ",
    );
  });
});

describe("flattenHeadlineSegments", () => {
  it("renders Connexus-like glued segments with readable spacing", () => {
    const flat = flattenHeadlineSegments([
      { kind: "text", text: "Connexus delivery confidence at" },
      { kind: "emphasis", text: "32" },
      { kind: "text", text: "—" },
      { kind: "emphasis", text: "Platform onboarding release" },
      { kind: "text", text: "is" },
      { kind: "emphasis", text: "50%" },
      { kind: "text", text: "ready to ship; integrations are aging." },
    ]);

    assert.match(flat, /at 32/);
    assert.match(flat, /release is 50%/);
    assert.doesNotMatch(flat, /at32/);
  });
});

describe("hasHeadlineSpacingDefects", () => {
  it("detects naive glued segments", () => {
    assert.equal(
      hasHeadlineSpacingDefects([
        { kind: "text", text: "confidence at" },
        { kind: "emphasis", text: "32" },
        { kind: "text", text: "—Platform" },
      ]),
      true,
    );
  });
});

describe("buildHeadlineSegmentsFromPlainText", () => {
  it("emphasizes known tokens from facts", () => {
    const segments = buildHeadlineSegmentsFromPlainText(
      "Connexus is in progress on Platform onboarding release — 50% ready to ship, delivery at risk.",
      ["Platform onboarding release", "50%"],
    );

    assert.equal(
      flattenHeadlineSegments(segments),
      "Connexus is in progress on Platform onboarding release — 50% ready to ship, delivery at risk.",
    );
  });
});

describe("resolveEnrichedHeadline", () => {
  const deterministic = [
    { kind: "text" as const, text: "Connexus is in progress on " },
    { kind: "emphasis" as const, text: "Platform onboarding release" },
    { kind: "text" as const, text: " — 50% ready to ship." },
  ];

  it("falls back when segmented output has spacing defects", () => {
    const resolved = resolveEnrichedHeadline({
      headlineFromLlm: [{ kind: "text", text: "confidence at32—Platform releaseis50%" }],
      narrative: "Narrative",
      emphasisTokens: ["32"],
      deterministicHeadline: deterministic,
    });

    assert.equal(resolved.enriched, false);
    assert.deepEqual(resolved.headline, deterministic);
  });

  it("accepts a plain-string headline", () => {
    const resolved = resolveEnrichedHeadline({
      headlineFromLlm:
        "Connexus is in progress on Platform onboarding release — 50% ready to ship, delivery at risk.",
      narrative: "Narrative",
      emphasisTokens: ["Platform onboarding release", "50%"],
      deterministicHeadline: deterministic,
    });

    assert.equal(resolved.enriched, true);
    assert.equal(hasHeadlineSpacingDefects(resolved.headline), false);
  });
});

describe("ensureHeadlineSegmentSpacing", () => {
  it("coalesces adjacent text segments", () => {
    const segments = ensureHeadlineSegmentSpacing([
      { kind: "text", text: "Hello" },
      { kind: "text", text: "world" },
    ]);

    assert.deepEqual(segments, [{ kind: "text", text: "Hello world" }]);
  });
});
