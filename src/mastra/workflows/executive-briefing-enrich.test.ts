import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executiveBriefingEnrichInputSchema } from "@/mastra/workflows/executive-briefing-enrich";

describe("executiveBriefingEnrichInputSchema", () => {
  it("accepts structured briefing facts", () => {
    const parsed = executiveBriefingEnrichInputSchema.safeParse({
      orgName: "Acme Corp",
      deterministicHeadline: [{ kind: "text", text: "Delivery is steady." }],
      narrative: "Delivery is steady.",
      health: {
        overall: 80,
        band: "steady",
        bandLabel: "Steady",
        dataGaps: [],
      },
      claims: [
        {
          id: "release",
          headline: "Release readiness",
          verdict: "good",
          verdictLabel: "On track",
          context: "Readiness is healthy.",
          metric: "80%",
        },
      ],
      highlights: [{ id: "health", value: "80" }],
      freshness: {
        asOf: new Date().toISOString(),
        stale: false,
        staleSources: [],
      },
      factsJson: "{}",
    });

    assert.equal(parsed.success, true);
  });

  it("rejects missing narrative", () => {
    const parsed = executiveBriefingEnrichInputSchema.safeParse({
      orgName: "Acme Corp",
      deterministicHeadline: [],
      health: {
        overall: 80,
        band: "steady",
        bandLabel: "Steady",
        dataGaps: [],
      },
      claims: [],
      freshness: {
        asOf: new Date().toISOString(),
        stale: false,
        staleSources: [],
      },
      factsJson: "{}",
    });

    assert.equal(parsed.success, false);
  });
});
