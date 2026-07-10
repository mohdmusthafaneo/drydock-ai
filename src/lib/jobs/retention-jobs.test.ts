import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RETENTION_POLICIES } from "./retention-jobs";

describe("RETENTION_POLICIES", () => {
  it("covers all Phase 5 hypertable targets", () => {
    const tables = RETENTION_POLICIES.map((p) => p.table);
    for (const name of [
      "TelemetryMetric",
      "TelemetryEvent",
      "WebhookEvent",
      "DeploymentEvent",
      "AgentHeartbeatRun",
      "AuditLog",
      "ActivityEvent",
      "AgentChatStreamChunk",
    ] as const) {
      assert.equal(tables.includes(name), true, `missing ${name}`);
    }
  });
});
