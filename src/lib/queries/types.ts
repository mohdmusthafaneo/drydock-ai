import type {
  AgentChatThreadStatus,
  AgentChatMessageKind,
  AgentChatParticipantRole,
  AgentStatus,
  AgentHeartbeatRunStatus,
  AgentWakeupSource,
  ApprovalDecision,
  ApprovalType,
} from "@/generated/prisma/client";

export type AgentListItem = {
  id: string;
  agentType: string;
  displayName: string;
  description: string | null;
  status: AgentStatus;
  autonomyMode: string;
  confidenceScore: number;
  lastHeartbeatAt: string | null;
  lastActiveAt: string | null;
  pendingWakeups: number;
  lastRun: {
    id: string;
    status: AgentHeartbeatRunStatus;
    source: AgentWakeupSource;
    reason: string;
    startedAt: string;
    finishedAt: string | null;
    summary: string | null;
  } | null;
};

export type AgentsListResponse = {
  agents: AgentListItem[];
};

export type AgentDetailResponse = {
  agent: {
    id: string;
    agentType: string;
    displayName: string;
    description: string | null;
    status: AgentStatus;
    autonomyMode: string;
    confidenceScore: number;
    lastHeartbeatAt: string | null;
    lastActiveAt: string | null;
    adapterType: string;
    runtimeConfig: Record<string, unknown>;
    pendingWakeups: number;
    reportsTo: { id: string; agentType: string; displayName: string } | null;
  };
  recentRuns: Array<{
    id: string;
    status: AgentHeartbeatRunStatus;
    source: AgentWakeupSource;
    reason: string;
    startedAt: string;
    finishedAt: string | null;
    summary: string | null;
    error: string | null;
  }>;
};

export type AgentRunItem = {
  id: string;
  status: AgentHeartbeatRunStatus;
  source: AgentWakeupSource;
  reason: string;
  startedAt: string;
  finishedAt: string | null;
  summary: string | null;
  error: string | null;
  exitCode: number | null;
  tokenUsage: {
    inputTokens?: number;
    outputTokens?: number;
    mode?: string;
  };
};

export type AgentRunsResponse = {
  runs: AgentRunItem[];
};

export type RunDetailResponse = {
  run: {
    id: string;
    status: AgentHeartbeatRunStatus;
    source: AgentWakeupSource;
    reason: string;
    startedAt: string;
    finishedAt: string | null;
    summary: string | null;
    error: string | null;
    exitCode: number | null;
    tokenUsage: {
      inputTokens?: number;
      outputTokens?: number;
      mode?: string;
    };
    logs: Array<{ at: string; level: string; message?: string }>;
    contextSnapshot: Record<string, unknown>;
    wakeupRequestId: string;
    mastraRunId: string | null;
    mastraTraceId: string | null;
  };
  agent: {
    id: string;
    displayName: string;
    agentType: string;
  };
};

export type ThreadListItemResponse = {
  id: string;
  title: string;
  status: AgentChatThreadStatus;
  updatedAt: string;
  _count: { messages: number; participants: number };
  messages: {
    id?: string;
    contentMarkdown: string;
    kind: string;
    createdAt?: string;
  }[];
};

export type AgentThreadsListResponse = {
  ok: true;
  threads: ThreadListItemResponse[];
  nextCursor: string | null;
};

export type ThreadTokenUsageResponse = {
  runCount: number;
  succeededRuns: number;
  inputTokens: number;
  outputTokens: number;
};

export type AgentThreadDetailResponse = {
  ok: true;
  tokenUsage: ThreadTokenUsageResponse;
  thread: {
    id: string;
    title: string;
    status: AgentChatThreadStatus;
    contextSummary?: string | null;
    closedAt?: string | null;
    updatedAt: string;
    participants: Array<{
      id: string;
      role: AgentChatParticipantRole;
      agent: { id: string; displayName: string; agentType: string } | null;
      user: { id: string; name: string } | null;
    }>;
    messages: Array<{
      id: string;
      kind: AgentChatMessageKind;
      contentMarkdown: string;
      reasoningJson?: string;
      createdAt: string;
      authorUser: { id: string; name: string } | null;
      authorAgent: { id: string; displayName: string } | null;
      approval: {
        id: string;
        type: ApprovalType;
        title: string | null;
        decision: ApprovalDecision | null;
        payloadJson: string;
        recommendation: { title: string; requiredRole: string | null } | null;
      } | null;
    }>;
  };
};

export const TERMINAL_RUN_STATUSES = new Set<AgentHeartbeatRunStatus>([
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
]);

export const LIVE_THREAD_STATUSES = new Set<AgentChatThreadStatus>([
  "open",
  "routing",
  "active",
  "awaiting_human",
]);
