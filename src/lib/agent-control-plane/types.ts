import type {
  AgentRegistry,
  AgentWakeupSource,
} from "@/generated/prisma/client";

export type AgentHeartbeatConfig = {
  enabled: boolean;
  intervalSec: number;
  wakeOnEvent: boolean;
  wakeOnApproval: boolean;
  wakeOnDelegation: boolean;
  cooldownSec: number;
  maxRunDurationSec: number;
};

export type AgentRuntimeConfig = {
  heartbeat: AgentHeartbeatConfig;
};

export type AgentPermissions = {
  canCreateAgents: boolean;
};

export type EnqueueWakeupInput = {
  organizationId: string;
  agentId: string;
  source: AgentWakeupSource;
  reason: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type AdapterExecutionContext = {
  runId: string;
  agent: AgentRegistry;
  wakeup: {
    id: string;
    source: AgentWakeupSource;
    reason: string;
    payloadJson: string;
  };
  organizationId: string;
};

export type AdapterExecutionResult = {
  status: "succeeded" | "failed" | "timed_out";
  summary?: string;
  error?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    mode?: "anthropic" | "openai" | "rule-engine";
  };
};

/** Priority: on_demand > approval/delegation > event > timer */
export const WAKEUP_SOURCE_PRIORITY: Record<AgentWakeupSource, number> = {
  on_demand: 0,
  approval: 1,
  delegation: 1,
  event: 2,
  timer: 3,
};

export const NON_RUNNABLE_STATUSES = new Set([
  "PAUSED",
  "PENDING_APPROVAL",
  "TERMINATED",
  "ERROR",
]);
