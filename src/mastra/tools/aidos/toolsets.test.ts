import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AgentType } from "@/generated/prisma/client";
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

const EXPECTED_TOOL_COUNTS: Record<
  AgentType,
  { withHire: number; withoutHire: number }
> = {
  SUPER_ORCHESTRATOR: { withHire: 12, withoutHire: 11 },
  QA_INTELLIGENCE: { withHire: 9, withoutHire: 9 },
  DEVOPS_INTELLIGENCE: { withHire: 7, withoutHire: 7 },
  GOVERNANCE: { withHire: 8, withoutHire: 8 },
  INCIDENT_CORRELATION: { withHire: 7, withoutHire: 7 },
  INTEGRATION: { withHire: 6, withoutHire: 6 },
};

describe("AIDOS Mastra tool allowlists", () => {
  it("defines all 16 aidos_* tools", () => {
    assert.equal(AIDOS_TOOL_IDS.length, 16);
  });

  for (const agentType of ALL_AGENT_TYPES) {
    it(`returns expected tool count for ${agentType}`, () => {
      const withHire = {
        canCreateAgents: agentType === "SUPER_ORCHESTRATOR",
      };
      const withoutHire = { canCreateAgents: false };
      const expected = EXPECTED_TOOL_COUNTS[agentType];

      assert.equal(
        listAidosToolIdsForAgent(agentType, withHire).length,
        expected.withHire,
      );
      assert.equal(
        listAidosToolIdsForAgent(agentType, withoutHire).length,
        expected.withoutHire,
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

  it("allows list_compliance_findings only for GOVERNANCE", () => {
    assert.equal(
      isAidosToolAllowedForAgent(
        "aidos_list_compliance_findings",
        "GOVERNANCE",
      ),
      true,
    );
    assert.equal(
      isAidosToolAllowedForAgent(
        "aidos_list_compliance_findings",
        "QA_INTELLIGENCE",
      ),
      false,
    );
  });
});
