import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { getEnv, resetEnvCacheForTests, validateRuntimeEnv } from "./env";

describe("env", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetEnvCacheForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvCacheForTests();
  });

  it("parses optional booleans without coercing unset values", () => {
    delete process.env.AGENT_WORKER_ENABLED;
    const env = getEnv();
    assert.equal(env.AGENT_WORKER_ENABLED, undefined);
  });

  it("parses true boolean env values", () => {
    process.env.AGENT_WORKER_ENABLED = "true";
    const env = getEnv();
    assert.equal(env.AGENT_WORKER_ENABLED, true);
  });

  it("requires DATABASE_URL at runtime validation", () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "development";
    assert.throws(() => validateRuntimeEnv(), /DATABASE_URL is required/);
  });

  it("passes runtime validation with DATABASE_URL in development", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/aidos";
    process.env.NODE_ENV = "development";
    assert.doesNotThrow(() => validateRuntimeEnv());
  });
});
