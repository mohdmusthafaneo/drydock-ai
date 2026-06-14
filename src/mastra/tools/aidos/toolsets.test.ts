import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AgentType } from "@/generated/prisma/client";
import { buildAidosLlmTools } from "@/lib/agent-control-plane/adapters/llm-tools";
import {
  listAidosToolIdsForAgent,
  isAidosToolAllowedForAgent,
} from "@/mastra/agents/toolsets";
import { AIDOS_TOOL_IDS } from "@/mastra/tools/aidos";

const ALL_AGENT_TYPES: AgentType[] = [
  "SUPER_ORCHESTRATOR",
  "QA_INTELLIGENCE",
  "DEVOPS_INTELLIGENCE",
  "GOVERNANCE",
  "INCIDENT_CORRELATION",
  "INTEGRATION",
];

describe("AIDOS Mastra tool allowlists", () => {
  it("defines all 14 legacy aidos_* tools", () => {
    assert.equal(AIDOS_TOOL_IDS.length, 14);
  });

  for (const agentType of ALL_AGENT_TYPES) {
    it(`matches legacy tool count for ${agentType}`, () => {
      const permissions = {
        canCreateAgents: agentType === "SUPER_ORCHESTRATOR",
      };
      const legacyNames = buildAidosLlmTools(agentType, permissions).map(
        (tool) => tool.name,
      );
      const mastraNames = listAidosToolIdsForAgent(agentType, permissions);

      assert.deepEqual(
        [...mastraNames].sort(),
        [...legacyNames].sort(),
        `tool allowlist mismatch for ${agentType}`,
      );
    });
  }

  it("blocks hire_agent without canCreateAgents permission", () => {
    assert.equal(
      isAidosToolAllowedForAgent("aidos_hire_agent", "SUPER_ORCHESTRATOR", {
        canCreateAgents: false,
      }),
      false,
    );
    assert.equal(
      isAidosToolAllowedForAgent("aidos_hire_agent", "SUPER_ORCHESTRATOR", {
        canCreateAgents: true,
      }),
      true,
    );
  });

  it("restricts super-only thread tools to SUPER_ORCHESTRATOR", () => {
    for (const toolId of [
      "aidos_delegate_wakeup",
      "aidos_close_thread",
    ] as const) {
      assert.equal(
        isAidosToolAllowedForAgent(toolId, "SUPER_ORCHESTRATOR"),
        true,
      );
      assert.equal(
        isAidosToolAllowedForAgent(toolId, "QA_INTELLIGENCE"),
        false,
      );
    }
  });

  it("allows assess_release only for QA_INTELLIGENCE", () => {
    assert.equal(
      isAidosToolAllowedForAgent("aidos_assess_release", "QA_INTELLIGENCE"),
      true,
    );
    assert.equal(
      isAidosToolAllowedForAgent(
        "aidos_assess_release",
        "DEVOPS_INTELLIGENCE",
      ),
      false,
    );
  });
});
