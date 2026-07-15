import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseWorkerQueues,
  workerServesRole,
  WORKER_QUEUE_ROLES,
} from "./worker-queues";

describe("parseWorkerQueues", () => {
  it("defaults to all", () => {
    const roles = parseWorkerQueues(undefined);
    assert.equal(roles.has("all"), true);
    assert.equal(workerServesRole(roles, "ml"), true);
    assert.equal(workerServesRole(roles, "retention"), true);
  });

  it("parses comma-separated roles", () => {
    const roles = parseWorkerQueues("ml,enrich");
    assert.equal(roles.has("all"), false);
    assert.equal(workerServesRole(roles, "ml"), true);
    assert.equal(workerServesRole(roles, "refresh"), false);
  });

  it("supports dedicated retention pool", () => {
    const roles = parseWorkerQueues("retention");
    assert.equal(workerServesRole(roles, "retention"), true);
    assert.equal(workerServesRole(roles, "ml"), false);
  });

  it("ignores unknown roles and falls back to all when empty", () => {
    const roles = parseWorkerQueues("nope,also-bad");
    assert.equal(roles.has("all"), true);
  });

  it("documents known roles", () => {
    assert.deepEqual([...WORKER_QUEUE_ROLES].sort(), [
      "all",
      "enrich",
      "ml",
      "refresh",
      "retention",
    ]);
  });
});
