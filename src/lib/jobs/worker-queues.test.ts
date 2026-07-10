import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWorkerQueues, workerServesRole } from "./worker-queues";

describe("parseWorkerQueues", () => {
  it("defaults to all", () => {
    const roles = parseWorkerQueues(undefined);
    assert.equal(roles.has("all"), true);
    assert.equal(workerServesRole(roles, "ml"), true);
  });

  it("parses comma-separated roles", () => {
    const roles = parseWorkerQueues("agents,ml");
    assert.equal(roles.has("all"), false);
    assert.equal(workerServesRole(roles, "ml"), true);
    assert.equal(workerServesRole(roles, "refresh"), false);
  });
});
