import type { AgentType } from "@/generated/prisma/client";

export type AgentToolName =
  | "assess_release"
  | "read_release_context"
  | "read_compliance_findings"
  | "create_recommendation"
  | "query_jira_jql"
  | "hire_agent"
  | "delegate_wakeup";

const TOOL_ALLOWLIST: Record<AgentType, AgentToolName[]> = {
  SUPER_ORCHESTRATOR: ["read_release_context", "hire_agent"],
  QA_INTELLIGENCE: [
    "assess_release",
    "read_release_context",
    "create_recommendation",
    "query_jira_jql",
  ],
  DEVOPS_INTELLIGENCE: ["read_release_context", "create_recommendation"],
  GOVERNANCE: [
    "read_release_context",
    "read_compliance_findings",
    "create_recommendation",
  ],
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
