import type {
  AgentChatMessage,
  AgentChatMessageKind,
  AgentChatThread,
  AgentChatThreadStatus,
} from "@/generated/prisma/client";

export type ReasoningJson = {
  thinking: string;
  tools: Array<{
    name: string;
    input: Record<string, unknown>;
    outputPreview?: string;
    startedAt: string;
    endedAt?: string;
    toolCallId?: string;
    isError?: boolean;
  }>;
};

/** NDJSON stream events from POST /messages. */
export type ChatStreamEvent =
  | { type: "message_saved"; messageId: string }
  | { type: "text_delta"; text: string }
  | { type: "thinking"; active: boolean }
  | { type: "thinking_delta"; text: string }
  | {
      type: "tool_start";
      tool: string;
      input?: Record<string, unknown>;
      toolCallId: string;
    }
  | {
      type: "tool_end";
      tool: string;
      outputPreview?: string;
      toolCallId: string;
      isError?: boolean;
    }
  | {
      type: "done";
      messageId: string;
      text: string;
      thinking?: string;
      tools?: ReasoningJson["tools"];
    }
  | { type: "error"; error: string };

import { readJsonField } from "@/lib/json-field";

export function parseReasoningJson(json: unknown): ReasoningJson {
  const parsed = readJsonField<Partial<ReasoningJson>>(json, {});
  return {
    thinking: parsed.thinking ?? "",
    tools: Array.isArray(parsed.tools) ? parsed.tools : [],
  };
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

export const OPEN_THREAD_STATUSES: AgentChatThreadStatus[] = ["open"];

export const DEFAULT_THREAD_LIST_LIMIT = 20;

export type AgentChatThreadSummary = AgentChatThread & {
  _count: { messages: number };
  messages: Pick<AgentChatMessage, "id" | "contentMarkdown" | "kind" | "createdAt">[];
};

export type AgentChatThreadDetail = AgentChatThread & {
  messages: (AgentChatMessage & {
    authorUser: { id: string; name: string } | null;
    approval: {
      id: string;
      type: string;
      title: string | null;
      decision: string | null;
      payloadJson: unknown;
      recommendation: { title: string; requiredRole: string | null } | null;
    } | null;
  })[];
};

export type CreateHumanMessageResult = {
  messageId: string;
};

export function truncateThreadTitle(text: string, maxLen = 80): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function displayMessageKind(kind: AgentChatMessageKind): string {
  return kind.replace(/_/g, " ");
}
