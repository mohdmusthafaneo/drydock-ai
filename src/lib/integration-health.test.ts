import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeIntegrationHealth } from "./integration-health";
import type { IntegrationHealthSummary } from "./integration-health";

function mockSummary(
  overrides: Partial<IntegrationHealthSummary> & Pick<IntegrationHealthSummary, "provider">,
): IntegrationHealthSummary {
  return {
    status: "CONNECTED",
    healthy: true,
    lastSyncAt: new Date(),
    lastHealthCheckAt: new Date(),
    lastError: null,
    webhookEnabled: false,
    message: "ok",
    ...overrides,
  };
}

describe("summarizeIntegrationHealth", () => {
  it("returns attention headline when empty", () => {
    const result = summarizeIntegrationHealth([]);
    assert.equal(result.total, 0);
    assert.equal(result.verdict, "attention");
    assert.match(result.headline, /No integrations/);
  });

  it("reports all healthy when every integration passes", () => {
    const result = summarizeIntegrationHealth([
      mockSummary({ provider: "GITHUB" }),
      mockSummary({ provider: "JIRA" }),
    ]);
    assert.equal(result.healthy, 2);
    assert.equal(result.verdict, "good");
    assert.match(result.headline, /All 2 integrations healthy/);
  });

  it("flags degraded integrations", () => {
    const result = summarizeIntegrationHealth([
      mockSummary({ provider: "GITHUB", healthy: false, message: "stale" }),
      mockSummary({ provider: "JIRA" }),
    ]);
    assert.equal(result.healthy, 1);
    assert.equal(result.verdict, "attention");
    assert.equal(result.firstUnhealthyProvider, "GITHUB");
  });
});
