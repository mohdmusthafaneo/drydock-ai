import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import {
  computeBriefingFactsHash,
  getBriefingEnrichIntervalSec,
  isBriefingEnrichEnabled,
  mergeExecutiveBriefingSnapshot,
  parseHeadlineJson,
  serializeHeadlineJson,
} from "@/lib/executive-briefing/snapshot-utils";

const deterministicBriefing: ExecutiveBriefing = {
  headline: [{ kind: "text", text: "Release v2.4 is " }, { kind: "emphasis", text: "72%" }, { kind: "text", text: " ready." }],
  meta: "Data as of 2 hours ago",
  highlights: [{ id: "readiness", label: "Readiness", value: "72%" }],
  narrative: "Release v2.4 is 72% ready.",
  wordCount: 5,
  health: {
    overall: 72,
    band: "steady",
    bandLabel: "Steady",
    dimensions: [],
    computedAt: new Date().toISOString(),
    dataGaps: [],
    visible: true,
  },
  claims: [
    {
      id: "release",
      headline: "Latest release readiness",
      verdict: "attention",
      verdictLabel: "Needs review",
      context: "Readiness is below target.",
    },
  ],
  freshness: {
    asOf: new Date().toISOString(),
    stale: false,
    staleSources: [],
  },
  source: "deterministic",
};

describe("parseHeadlineJson", () => {
  it("parses valid headline segments", () => {
    const json = serializeHeadlineJson(deterministicBriefing.headline);
    const parsed = parseHeadlineJson(json);
    assert.deepEqual(parsed, deterministicBriefing.headline);
  });

  it("returns null for invalid JSON", () => {
    assert.equal(parseHeadlineJson("{bad"), null);
  });

  it("returns null for empty segments", () => {
    assert.equal(parseHeadlineJson("[]"), null);
  });
});

describe("mergeExecutiveBriefingSnapshot", () => {
  it("overlays headline fields when snapshot is fresh", () => {
    const merged = mergeExecutiveBriefingSnapshot(deterministicBriefing, {
      headlineJson: serializeHeadlineJson([
        { kind: "text", text: "AI headline for " },
        { kind: "emphasis", text: "v2.4" },
      ]),
      narrative: "AI narrative with more context for leadership.",
      expiresAt: new Date(Date.now() + 60_000),
    });

    assert.equal(merged.source, "llm_enriched");
    assert.equal(merged.narrative, "AI narrative with more context for leadership.");
    assert.equal(merged.health.overall, deterministicBriefing.health.overall);
    assert.deepEqual(merged.claims, deterministicBriefing.claims);
    assert.equal(merged.headline[1]?.kind, "emphasis");
  });

  it("falls back to deterministic when snapshot is expired", () => {
    const merged = mergeExecutiveBriefingSnapshot(deterministicBriefing, {
      headlineJson: serializeHeadlineJson([{ kind: "text", text: "Expired" }]),
      narrative: "Expired narrative",
      expiresAt: new Date(Date.now() - 60_000),
    });

    assert.equal(merged.source, "deterministic");
    assert.equal(merged.narrative, deterministicBriefing.narrative);
  });

  it("falls back when headline JSON is invalid", () => {
    const merged = mergeExecutiveBriefingSnapshot(deterministicBriefing, {
      headlineJson: "not-json",
      narrative: "Broken",
      expiresAt: new Date(Date.now() + 60_000),
    });

    assert.equal(merged.source, "deterministic");
  });

  it("falls back when stored headline has spacing defects", () => {
    const merged = mergeExecutiveBriefingSnapshot(deterministicBriefing, {
      headlineJson: JSON.stringify([
        { kind: "text", text: "Connexus delivery confidence at" },
        { kind: "emphasis", text: "32" },
        { kind: "text", text: "—Platform onboarding releaseis" },
        { kind: "emphasis", text: "50%" },
      ]),
      narrative: "Broken spacing",
      expiresAt: new Date(Date.now() + 60_000),
    });

    assert.equal(merged.source, "deterministic");
    assert.equal(merged.narrative, deterministicBriefing.narrative);
  });
});

describe("computeBriefingFactsHash", () => {
  it("changes when claim headlines change", () => {
    const baseHash = computeBriefingFactsHash(deterministicBriefing);
    const changed = computeBriefingFactsHash({
      ...deterministicBriefing,
      claims: [
        {
          ...deterministicBriefing.claims[0]!,
          headline: "Different headline",
        },
      ],
    });
    assert.notEqual(baseHash, changed);
  });
});

describe("briefing enrich env helpers", () => {
  it("defaults interval to 7200 seconds", () => {
    const previous = process.env.EXECUTIVE_BRIEFING_ENRICH_INTERVAL_SEC;
    delete process.env.EXECUTIVE_BRIEFING_ENRICH_INTERVAL_SEC;
    assert.equal(getBriefingEnrichIntervalSec(), 7200);
    if (previous !== undefined) {
      process.env.EXECUTIVE_BRIEFING_ENRICH_INTERVAL_SEC = previous;
    }
  });

  it("treats enrich as enabled by default", () => {
    const previous = process.env.EXECUTIVE_BRIEFING_ENRICH_ENABLED;
    delete process.env.EXECUTIVE_BRIEFING_ENRICH_ENABLED;
    assert.equal(isBriefingEnrichEnabled(), true);
    if (previous !== undefined) {
      process.env.EXECUTIVE_BRIEFING_ENRICH_ENABLED = previous;
    }
  });
});
