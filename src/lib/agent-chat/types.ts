import type {
  AgentChatMessage,
  AgentChatMessageKind,
  AgentChatParticipant,
  AgentChatThread,
  AgentChatThreadStatus,
} from "@/generated/prisma/client";

export type ChatWakeupPayload = {
  threadId: string;
  triggerMessageId: string;
  targetAgentId?: string;
  approvalId?: string;
  decision?: "APPROVED" | "REJECTED" | "MODIFIED";
};

export type ReasoningJson = {
  thinking: string;
  tools: Array<{
    name: string;
    input: Record<string, unknown>;
    outputPreview?: string;
    startedAt: string;
    endedAt?: string;
  }>;
};

export type StreamChunkSsePayload = {
  runId: string;
  agentId: string;
  messageId?: string;
  kind: string;
  text?: string;
  thinking?: string;
  tool?: string;
  input?: Record<string, unknown>;
  outputPreview?: string;
  error?: string;
};

export function parseReasoningJson(json: string): ReasoningJson {
  try {
    const parsed = JSON.parse(json) as Partial<ReasoningJson>;
    return {
      thinking: parsed.thinking ?? "",
      tools: Array.isArray(parsed.tools) ? parsed.tools : [],
    };
  } catch {
    return { thinking: "", tools: [] };
  }
}

export function buildReasoningJson(state: {
  thinking: string;
  tools: ReasoningJson["tools"];
}): string {
  return JSON.stringify({
    thinking: state.thinking,
    tools: state.tools,
  } satisfies ReasoningJson);
}

export type ThreadListStatusFilter = "open" | "done" | "all";

export const OPEN_THREAD_STATUSES: AgentChatThreadStatus[] = [
  "open",
  "routing",
  "active",
  "awaiting_human",
  "stalled",
];

export const DEFAULT_THREAD_LIST_LIMIT = 20;

export type AgentChatThreadSummary = AgentChatThread & {
  _count: { messages: number; participants: number };
  messages: Pick<AgentChatMessage, "id" | "contentMarkdown" | "kind" | "createdAt">[];
};

export type AgentChatThreadDetail = AgentChatThread & {
  participants: (AgentChatParticipant & {
    agent: { id: string; displayName: string; agentType: string } | null;
    user: { id: string; name: string } | null;
  })[];
  messages: (AgentChatMessage & {
    authorUser: { id: string; name: string } | null;
    authorAgent: { id: string; displayName: string } | null;
    approval: {
      id: string;
      type: string;
      title: string | null;
      decision: string | null;
      payloadJson: string;
      recommendation: { title: string; requiredRole: string | null } | null;
    } | null;
  })[];
};

export type CreateHumanMessageResult = {
  messageId: string;
  wakeupId: string | null;
  coalesced: boolean;
};

export function truncateThreadTitle(text: string, maxLen = 80): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function displayMessageKind(kind: AgentChatMessageKind): string {
  return kind.replace(/_/g, " ");
}
