import type { AgentRegistry, AgentType } from "@/generated/prisma/client";
import { readJsonField, stringifyJsonField } from "@/lib/json-field";
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
  coalescingEnabled: true,
  cooldownSec: 30,
  maxRunDurationSec: 300,
};

export const LEAD_HEARTBEAT: AgentHeartbeatConfig = {
  enabled: true,
  intervalSec: DEFAULT_HEARTBEAT_SEC,
  wakeOnEvent: true,
  wakeOnApproval: true,
  wakeOnDelegation: true,
  coalescingEnabled: false,
  cooldownSec: 30,
  maxRunDurationSec: 300,
};

export const SPECIALIST_HEARTBEAT: AgentHeartbeatConfig = {
  enabled: false,
  intervalSec: 0,
  wakeOnEvent: true,
  wakeOnApproval: true,
  wakeOnDelegation: true,
  coalescingEnabled: false,
  cooldownSec: 30,
  maxRunDurationSec: 300,
};

export function defaultRuntimeConfigForAgentType(
  agentType: AgentType,
): AgentRuntimeConfig {
  const heartbeat =
    agentType === "SUPER_ORCHESTRATOR"
      ? { ...LEAD_HEARTBEAT }
      : { ...SPECIALIST_HEARTBEAT };

  return { heartbeat };
}

export function parseRuntimeConfig(json: unknown): AgentRuntimeConfig {
  const parsed = readJsonField<Partial<AgentRuntimeConfig>>(json, {});
  return {
    heartbeat: {
      ...DEFAULT_HEARTBEAT,
      ...(parsed.heartbeat ?? {}),
    },
  };
}

/** Resolve config from DB row, falling back to per-type defaults when unset. */
export function resolveRuntimeConfig(agent: Pick<AgentRegistry, "runtimeConfigJson" | "agentType">): AgentRuntimeConfig {
  const trimmed = stringifyJsonField(agent.runtimeConfigJson ?? {}).trim();
  if (!trimmed || trimmed === "{}" || trimmed === "null") {
    return defaultRuntimeConfigForAgentType(agent.agentType);
  }
  return parseRuntimeConfig(agent.runtimeConfigJson);
}

export function serializeRuntimeConfig(config: AgentRuntimeConfig): string {
  return JSON.stringify(config);
}
