import type { AgentType } from "@/generated/prisma/client";

import {
  getAllowedTools,
  type AgentToolName,
} from "@/lib/agent-control-plane/tools/registry";
import type { AgentPermissions } from "@/lib/agent-control-plane/types";

import {
  aidosTools,
  AIDOS_TOOL_IDS,
  TOOL_TO_REGISTRY,
  type AidosToolId,
  type AidosToolMap,
} from "../tools/aidos";

const SUPER_ONLY_TOOLS = new Set<AidosToolId>([
  "aidos_complete_initialization",
  "aidos_delegate_wakeup",
  "aidos_invite_agent_to_thread",
  "aidos_close_thread",
  "aidos_reopen_thread",
]);

function isSuperOnlyTool(toolId: AidosToolId): boolean {
  return SUPER_ONLY_TOOLS.has(toolId);
}

export function isAidosToolAllowedForAgent(
  toolId: AidosToolId,
  agentType: AgentType,
  permissions?: AgentPermissions,
  allowedRegistryTools: Set<AgentToolName> = new Set(getAllowedTools(agentType)),
): boolean {
  if (toolId === "aidos_hire_agent" && !permissions?.canCreateAgents) {
    return false;
  }
  if (isSuperOnlyTool(toolId) && agentType !== "SUPER_ORCHESTRATOR") {
    return false;
  }

  const registryName = TOOL_TO_REGISTRY[toolId];
  return registryName === null || allowedRegistryTools.has(registryName);
}

/** Mastra tool map scoped to agent type and permissions (parity with buildAidosLlmTools). */
export function getAidosToolsForAgent(
  agentType: AgentType,
  permissions?: AgentPermissions,
): Record<string, AidosToolMap[AidosToolId]> {
  const allowedRegistryTools = new Set(getAllowedTools(agentType));
  const tools: Record<string, AidosToolMap[AidosToolId]> = {};

  for (const toolId of AIDOS_TOOL_IDS) {
    if (
      isAidosToolAllowedForAgent(
        toolId,
        agentType,
        permissions,
        allowedRegistryTools,
      )
    ) {
      tools[toolId] = aidosTools[toolId];
    }
  }

  return tools;
}

export function listAidosToolIdsForAgent(
  agentType: AgentType,
  permissions?: AgentPermissions,
): AidosToolId[] {
  const allowedRegistryTools = new Set(getAllowedTools(agentType));
  return AIDOS_TOOL_IDS.filter((toolId) =>
    isAidosToolAllowedForAgent(
      toolId,
      agentType,
      permissions,
      allowedRegistryTools,
    ),
  );
}
