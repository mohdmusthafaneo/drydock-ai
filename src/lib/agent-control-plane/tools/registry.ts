import type { AgentType } from "@/generated/prisma/client";

export type AgentToolName =
  | "assess_release"
  | "read_release_context"
  | "create_recommendation"
  | "hire_agent";

const TOOL_ALLOWLIST: Record<AgentType, AgentToolName[]> = {
  SUPER_ORCHESTRATOR: [
    "assess_release",
    "read_release_context",
    "create_recommendation",
    "hire_agent",
  ],
  QA_INTELLIGENCE: ["assess_release", "read_release_context", "create_recommendation"],
  DEVOPS_INTELLIGENCE: ["read_release_context", "create_recommendation"],
  GOVERNANCE: ["read_release_context", "create_recommendation"],
  INCIDENT_CORRELATION: ["read_release_context", "create_recommendation"],
  INTEGRATION: ["read_release_context"],
};

export function getAllowedTools(agentType: AgentType): AgentToolName[] {
  return TOOL_ALLOWLIST[agentType] ?? [];
}

export function isToolAllowed(
  agentType: AgentType,
  toolName: AgentToolName,
): boolean {
  return getAllowedTools(agentType).includes(toolName);
}
