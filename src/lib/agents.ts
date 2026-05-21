import type { AgentType, AutonomyMode } from "@/generated/prisma/client";

export type AgentDefinition = {
  agentType: AgentType;
  displayName: string;
  description: string;
  defaultConfidence: number;
  autonomyMode: AutonomyMode;
};

/** Master FRD §10 — Agent Hierarchy */
export const DEFAULT_AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    agentType: "SUPER_ORCHESTRATOR",
    displayName: "Super Orchestrator",
    description: "Coordinates governance-aware multi-agent workflows",
    defaultConfidence: 0.92,
    autonomyMode: "ASSIST",
  },
  {
    agentType: "QA_INTELLIGENCE",
    displayName: "QA Intelligence Agent",
    description: "Coverage gaps, regression intelligence, release readiness",
    defaultConfidence: 0.88,
    autonomyMode: "RECOMMEND",
  },
  {
    agentType: "DEVOPS_INTELLIGENCE",
    displayName: "DevOps Intelligence Agent",
    description: "Deployment risk, rollback intelligence, remediation",
    defaultConfidence: 0.86,
    autonomyMode: "RECOMMEND",
  },
  {
    agentType: "GOVERNANCE",
    displayName: "Governance Agent",
    description: "Policy enforcement, risk scoring, audit alignment",
    defaultConfidence: 0.9,
    autonomyMode: "RECOMMEND",
  },
  {
    agentType: "INCIDENT_CORRELATION",
    displayName: "Incident Correlation Agent",
    description: "Correlates incidents with releases and telemetry",
    defaultConfidence: 0.84,
    autonomyMode: "OBSERVE",
  },
  {
    agentType: "INTEGRATION",
    displayName: "Integration Agents",
    description: "GitHub, Jira, Grafana, Prometheus connectors",
    defaultConfidence: 0.8,
    autonomyMode: "OBSERVE",
  },
];

export const WORKFLOW_MODES = [
  { mode: "OBSERVE", label: "Observe", description: "AI monitors only — no recommendations" },
  { mode: "RECOMMEND", label: "Recommend", description: "AI proposes — humans decide" },
  { mode: "ASSIST", label: "Assist", description: "AI prepares actions — approval required" },
  { mode: "SEMI_AUTONOMOUS", label: "Semi-Autonomous", description: "Limited auto-execution within policy" },
] as const;
