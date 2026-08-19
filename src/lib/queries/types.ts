import type {
  AgentChatThreadStatus,
  AgentChatMessageKind,
  ApprovalDecision,
  ApprovalType,
} from "@/generated/prisma/client";

export type ThreadListItemResponse = {
  id: string;
  title: string;
  status: AgentChatThreadStatus;
  updatedAt: string;
  _count: { messages: number };
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

export type AgentThreadDetailResponse = {
  ok: true;
  thread: {
    id: string;
    title: string;
    status: AgentChatThreadStatus;
    contextSummary?: string | null;
    closedAt?: string | null;
    updatedAt: string;
    messages: Array<{
      id: string;
      kind: AgentChatMessageKind;
      contentMarkdown: string;
      reasoningJson?: string;
      createdAt: string;
      authorUser: { id: string; name: string } | null;
      approval: {
        id: string;
        type: ApprovalType;
        title: string | null;
        decision: ApprovalDecision | null;
        payloadJson: unknown;
        recommendation: { title: string; requiredRole: string | null } | null;
      } | null;
    }>;
  };
};

export const LIVE_THREAD_STATUSES = new Set<AgentChatThreadStatus>(["open"]);
