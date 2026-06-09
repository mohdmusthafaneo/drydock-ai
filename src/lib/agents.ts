import type { AgentType, AutonomyMode } from "@/generated/prisma/client";

export type AgentDefinition = {
  agentType: AgentType;
  displayName: string;
  description: string;
  defaultConfidence: number;
  autonomyMode: AutonomyMode;
};

/**
 * Org bootstrap roster — exactly one Super Agent at seed time.
 * Specialists are hired by the Super Agent via governed AGENT_HIRE flow (Phase 5.3).
 */
export const DEFAULT_AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    agentType: "SUPER_ORCHESTRATOR",
    displayName: "Super Agent",
    description:
      "Leads operational intelligence — delegates work and hires specialists under human approval",
    defaultConfidence: 0.92,
    autonomyMode: "ASSIST",
  },
];

export const WORKFLOW_MODES = [
  { mode: "OBSERVE", label: "Observe", description: "AI monitors only — no recommendations" },
  { mode: "RECOMMEND", label: "Recommend", description: "AI proposes — humans decide" },
  { mode: "ASSIST", label: "Assist", description: "AI prepares actions — approval required" },
  { mode: "SEMI_AUTONOMOUS", label: "Semi-Autonomous", description: "Limited auto-execution within policy" },
] as const;
