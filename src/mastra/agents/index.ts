import type { AgentType } from "@/generated/prisma/client";
import { Agent } from "@mastra/core/agent";

import { resolveMastraModelConfig } from "../config/models";
import { getAidosToolsForAgent } from "./toolsets";

export const AGENT_TYPE_TO_MASTRA_ID: Record<AgentType, string> = {
  SUPER_ORCHESTRATOR: "superOrchestratorAgent",
  QA_INTELLIGENCE: "qaIntelligenceAgent",
  DEVOPS_INTELLIGENCE: "devopsIntelligenceAgent",
  GOVERNANCE: "governanceAgent",
  INCIDENT_CORRELATION: "incidentCorrelationAgent",
  INTEGRATION: "integrationAgent",
};

const BASE_INSTRUCTIONS: Record<AgentType, string> = {
  SUPER_ORCHESTRATOR: `You are the AIDOS Super Orchestrator agent.

Coordinate governed agent operations across the organization. Follow HEARTBEAT.md, CHAT.md, and skills/aidos/SKILL.md from your managed instruction bundle (injected at runtime).

Use AIDOS tools for all mutations. Critical actions require human approval before execution.`,
  QA_INTELLIGENCE: `You are the AIDOS QA Intelligence specialist.

Assess releases, create recommendations, and complete inbox work. Follow HEARTBEAT.md, CHAT.md, TOOLS.md, and skills/aidos/SKILL.md from your managed instruction bundle (injected at runtime).

For Jira board questions in chat (open bugs, blocked work, sprint scope), use aidos_query_jira_jql before answering — read-only live JQL against the org's connected projects. Your system prompt includes runtime Jira context (site, sync projects, boards, active sprints, toolchain mapping) for query generation.

Use AIDOS tools for all mutations.`,
  DEVOPS_INTELLIGENCE: `You are the AIDOS DevOps Intelligence specialist.

Monitor delivery signals and create governance recommendations. Follow HEARTBEAT.md, CHAT.md, TOOLS.md, and skills/aidos/SKILL.md from your managed instruction bundle (injected at runtime).

Use AIDOS tools for all mutations.`,
  GOVERNANCE: `You are the AIDOS Governance specialist.

Review operational signals and create recommendations. Follow HEARTBEAT.md, CHAT.md, TOOLS.md, and skills/aidos/SKILL.md from your managed instruction bundle (injected at runtime).

Use AIDOS tools for all mutations.`,
  INCIDENT_CORRELATION: `You are the AIDOS Incident Correlation specialist.

Correlate incidents and create recommendations. Follow HEARTBEAT.md, CHAT.md, TOOLS.md, and skills/aidos/SKILL.md from your managed instruction bundle (injected at runtime).

Use AIDOS tools for all mutations.`,
  INTEGRATION: `You are the AIDOS Integration specialist.

Handle integration-related operational work. Follow HEARTBEAT.md, CHAT.md, TOOLS.md, and skills/aidos/SKILL.md from your managed instruction bundle (injected at runtime).

Use AIDOS tools for all mutations.`,
};

function createTypedAgent(agentType: AgentType): Agent {
  const id = AGENT_TYPE_TO_MASTRA_ID[agentType];
  return new Agent({
    id,
    name: id,
    instructions: BASE_INSTRUCTIONS[agentType],
    model: resolveMastraModelConfig(),
    tools: getAidosToolsForAgent(agentType, { canCreateAgents: agentType === "SUPER_ORCHESTRATOR" }),
  });
}

export const superOrchestratorAgent = createTypedAgent("SUPER_ORCHESTRATOR");
export const qaIntelligenceAgent = createTypedAgent("QA_INTELLIGENCE");
export const devopsIntelligenceAgent = createTypedAgent("DEVOPS_INTELLIGENCE");
export const governanceAgent = createTypedAgent("GOVERNANCE");
export const incidentCorrelationAgent = createTypedAgent("INCIDENT_CORRELATION");
export const integrationAgent = createTypedAgent("INTEGRATION");

export const aidosAgents = {
  superOrchestratorAgent,
  qaIntelligenceAgent,
  devopsIntelligenceAgent,
  governanceAgent,
  incidentCorrelationAgent,
  integrationAgent,
} as const;

const AGENT_BY_TYPE: Record<AgentType, Agent> = {
  SUPER_ORCHESTRATOR: superOrchestratorAgent,
  QA_INTELLIGENCE: qaIntelligenceAgent,
  DEVOPS_INTELLIGENCE: devopsIntelligenceAgent,
  GOVERNANCE: governanceAgent,
  INCIDENT_CORRELATION: incidentCorrelationAgent,
  INTEGRATION: integrationAgent,
};

export function getMastraAgentIdForType(agentType: AgentType): string {
  return AGENT_TYPE_TO_MASTRA_ID[agentType];
}

export function getAidosAgentForType(agentType: AgentType): Agent {
  return AGENT_BY_TYPE[agentType];
}
