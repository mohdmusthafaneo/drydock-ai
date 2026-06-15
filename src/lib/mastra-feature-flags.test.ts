import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isAgentThreadIngressMastraEnabled,
  isDiscoveryDnaLlmEnabled,
  isMvpAcceleratorLlmEnabled,
} from "@/lib/mastra-feature-flags";

describe("mastra feature flags", () => {
  it("defaults LLM surface flags to false", () => {
    delete process.env.MASTRA_DISCOVERY_DNA_LLM_ENABLED;
    delete process.env.MASTRA_MVP_ACCELERATOR_LLM_ENABLED;
    delete process.env.MASTRA_AGENT_THREAD_INGRESS_ENABLED;

    assert.equal(isDiscoveryDnaLlmEnabled(), false);
    assert.equal(isMvpAcceleratorLlmEnabled(), false);
    assert.equal(isAgentThreadIngressMastraEnabled(), true);
  });

  it("reads explicit true env values", () => {
    const prevDiscovery = process.env.MASTRA_DISCOVERY_DNA_LLM_ENABLED;
    const prevAccelerator = process.env.MASTRA_MVP_ACCELERATOR_LLM_ENABLED;

    process.env.MASTRA_DISCOVERY_DNA_LLM_ENABLED = "true";
    process.env.MASTRA_MVP_ACCELERATOR_LLM_ENABLED = "1";

    assert.equal(isDiscoveryDnaLlmEnabled(), true);
    assert.equal(isMvpAcceleratorLlmEnabled(), true);

    if (prevDiscovery === undefined) {
      delete process.env.MASTRA_DISCOVERY_DNA_LLM_ENABLED;
    } else {
      process.env.MASTRA_DISCOVERY_DNA_LLM_ENABLED = prevDiscovery;
    }
    if (prevAccelerator === undefined) {
      delete process.env.MASTRA_MVP_ACCELERATOR_LLM_ENABLED;
    } else {
      process.env.MASTRA_MVP_ACCELERATOR_LLM_ENABLED = prevAccelerator;
    }
  });
});
