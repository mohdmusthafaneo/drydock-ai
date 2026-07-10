import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { contentHash } from "./content-hash";
import { isLlmFeatureEnabled } from "./feature-flags";
import { resolveModelForFeature } from "./model-routing";
import {
  getOrgTokenUsageForTests,
  resetLlmGovernorForTests,
  runMeteredLlmCall,
} from "./cost-governor";

describe("contentHash", () => {
  it("is stable under key reordering", () => {
    assert.equal(contentHash({ a: 1, b: 2 }), contentHash({ b: 2, a: 1 }));
  });
});

describe("feature flags", () => {
  it("respects kill switch", () => {
    const prev = process.env.LLM_KILL_SWITCH;
    process.env.LLM_KILL_SWITCH = "true";
    assert.equal(isLlmFeatureEnabled("executive_briefing"), false);
    process.env.LLM_KILL_SWITCH = prev;
  });
});

describe("model routing", () => {
  it("routes bulk features to cheap tier", () => {
    const routed = resolveModelForFeature("code_analysis_enrich");
    assert.equal(routed.tier, "cheap");
  });
});

describe("runMeteredLlmCall", () => {
  beforeEach(() => {
    resetLlmGovernorForTests();
    delete process.env.LLM_KILL_SWITCH;
    delete process.env.LLM_FEATURE_EXECUTIVE_BRIEFING;
    process.env.LLM_ORG_DAILY_TOKEN_BUDGET = "1000";
  });

  it("caches identical content hashes", async () => {
    let calls = 0;
    const first = await runMeteredLlmCall({
      organizationId: "org1",
      feature: "executive_briefing",
      cacheKeyParts: { facts: "abc" },
      estimatedPromptTokens: 10,
      execute: async () => {
        calls += 1;
        return { result: { ok: true }, promptTokens: 10, completionTokens: 5 };
      },
    });
    const second = await runMeteredLlmCall({
      organizationId: "org1",
      feature: "executive_briefing",
      cacheKeyParts: { facts: "abc" },
      estimatedPromptTokens: 10,
      execute: async () => {
        calls += 1;
        return { result: { ok: false }, promptTokens: 10, completionTokens: 5 };
      },
    });

    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    if (first.status === "ok" && second.status === "ok") {
      assert.equal(first.cached, false);
      assert.equal(second.cached, true);
      assert.deepEqual(second.result, { ok: true });
    }
    assert.equal(calls, 1);
    assert.equal(await getOrgTokenUsageForTests("org1"), 15);
  });

  it("skips when budget exceeded", async () => {
    process.env.LLM_ORG_DAILY_TOKEN_BUDGET = "5";
    const outcome = await runMeteredLlmCall({
      organizationId: "org2",
      feature: "executive_briefing",
      cacheKeyParts: { x: 1 },
      estimatedPromptTokens: 10,
      execute: async () => ({ result: 1 }),
    });
    assert.deepEqual(outcome, { status: "skipped", reason: "budget_exceeded" });
  });
});
