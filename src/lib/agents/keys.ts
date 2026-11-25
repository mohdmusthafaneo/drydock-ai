/**
 * Client-safe catalog of configurable DryDock / Mastra agents.
 * Base system prompts live server-side in base-prompts.ts.
 */

export const AGENT_KEYS = [
  "productivity",
  "qa",
  "governance",
  "devops",
  "drydockAssistant",
  "aidosAssistant",
] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

export type AgentCatalogEntry = {
  key: AgentKey;
  label: string;
  description: string;
  /** Mastra registry key passed to mastra.getAgent() */
  mastraId: string;
};

export const AGENT_CATALOG: Record<AgentKey, AgentCatalogEntry> = {
  productivity: {
    key: "productivity",
    label: "Productivity",
    description:
      "Analyzes contributor productivity from Git history for connected repositories.",
    mastraId: "productivityAgent",
  },
  qa: {
    key: "qa",
    label: "QA",
    description:
      "Assesses Jira board health and surfaces quality and delivery risks.",
    mastraId: "qaAgent",
  },
  governance: {
    key: "governance",
    label: "Compliance",
    description:
      "Surfaces code-change risk, health hotspots, and cleanup debt via repowise.",
    mastraId: "governanceAgent",
  },
  devops: {
    key: "devops",
    label: "Delivery",
    description:
      "Runs AWS account hygiene scans and persists cloud delivery findings.",
    mastraId: "devopsAgent",
  },
  drydockAssistant: {
    key: "drydockAssistant",
    label: "DryDock Assistant",
    description:
      "Floating Overview chat for engineering leadership and QA architects.",
    mastraId: "drydockAssistant",
  },
  aidosAssistant: {
    key: "aidosAssistant",
    label: "Conversations Assistant",
    description:
      "In-process / Slack assistant over persisted analysis and test-trust context.",
    mastraId: "aidosAssistant",
  },
};

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value);
}

export function parseAgentKey(value: string): AgentKey | null {
  return isAgentKey(value) ? value : null;
}

export function listAgentCatalog(): AgentCatalogEntry[] {
  return AGENT_KEYS.map((key) => AGENT_CATALOG[key]);
}
