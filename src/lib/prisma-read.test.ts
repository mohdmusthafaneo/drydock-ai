import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { isReadReplicaConfigured } from "./prisma";

describe("isReadReplicaConfigured", () => {
  const prev = process.env.DATABASE_URL_REPLICA;

  afterEach(() => {
    if (prev === undefined) delete process.env.DATABASE_URL_REPLICA;
    else process.env.DATABASE_URL_REPLICA = prev;
  });

  it("is false when unset", () => {
    delete process.env.DATABASE_URL_REPLICA;
    assert.equal(isReadReplicaConfigured(), false);
  });

  it("is true when DATABASE_URL_REPLICA is set", () => {
    process.env.DATABASE_URL_REPLICA =
      "postgresql://aidos:pass@localhost:5433/aidos";
    assert.equal(isReadReplicaConfigured(), true);
  });
});
