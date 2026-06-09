import type { AgentRegistry, AgentType } from "@/generated/prisma/client";
import type { AgentHeartbeatConfig, AgentRuntimeConfig } from "./types";

const DEFAULT_HEARTBEAT_SEC = Number(
  process.env.AGENT_DEFAULT_HEARTBEAT_SEC ?? "900",
);

export const DEFAULT_HEARTBEAT: AgentHeartbeatConfig = {
  enabled: false,
  intervalSec: 0,
  wakeOnEvent: true,
  wakeOnApproval: false,
  wakeOnDelegation: true,
  cooldownSec: 30,
  maxRunDurationSec: 300,
};

export const LEAD_HEARTBEAT: AgentHeartbeatConfig = {
  enabled: true,
  intervalSec: DEFAULT_HEARTBEAT_SEC,
  wakeOnEvent: true,
  wakeOnApproval: true,
  wakeOnDelegation: true,
  cooldownSec: 30,
  maxRunDurationSec: 300,
};

export function defaultRuntimeConfigForAgentType(
  agentType: AgentType,
): AgentRuntimeConfig {
  const heartbeat =
    agentType === "SUPER_ORCHESTRATOR"
      ? { ...LEAD_HEARTBEAT }
      : { ...DEFAULT_HEARTBEAT };

  return { heartbeat };
}

export function parseRuntimeConfig(json: string): AgentRuntimeConfig {
  try {
    const parsed = JSON.parse(json) as Partial<AgentRuntimeConfig>;
    return {
      heartbeat: {
        ...DEFAULT_HEARTBEAT,
        ...(parsed.heartbeat ?? {}),
      },
    };
  } catch {
    return { heartbeat: { ...DEFAULT_HEARTBEAT } };
  }
}

/** Resolve config from DB row, falling back to per-type defaults when unset. */
export function resolveRuntimeConfig(agent: Pick<AgentRegistry, "runtimeConfigJson" | "agentType">): AgentRuntimeConfig {
  const trimmed = agent.runtimeConfigJson?.trim();
  if (!trimmed || trimmed === "{}" || trimmed === "null") {
    return defaultRuntimeConfigForAgentType(agent.agentType);
  }
  return parseRuntimeConfig(trimmed);
}

export function serializeRuntimeConfig(config: AgentRuntimeConfig): string {
  return JSON.stringify(config);
}
