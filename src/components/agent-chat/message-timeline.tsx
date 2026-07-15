"use client";

import type { ReactNode } from "react";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/prompt-kit/message";
import { cn } from "@/lib/utils";
import type { AgentChatMessageKind } from "@/generated/prisma/client";
import { StreamingMessageBubble } from "@/components/agent-chat/streaming-message";
import type { StreamingMessageState } from "@/components/agent-chat/use-agent-thread-stream";
import {
  ApprovalInlineCard,
  resolveApprovalRequiredRole,
  resolveApprovalTitle,
  type ThreadApprovalSnapshot,
} from "@/components/agent-chat/approval-inline-card";

export type TimelineMessage = {
  id: string;
  kind: AgentChatMessageKind | "agent_reply";
  contentMarkdown: string;
  reasoningJson?: string;
  createdAt: Date | string;
  authorUser: { id: string; name: string } | null;
  approval?: ThreadApprovalSnapshot | null;
};

function isAssistantKind(kind: TimelineMessage["kind"]): boolean {
  return kind === "assistant" || kind === "agent_reply";
}

function authorLabel(message: TimelineMessage): string {
  if (message.kind === "human") {
    return message.authorUser?.name ?? "You";
  }
  if (isAssistantKind(message.kind)) {
    return "AIDOS";
  }
  return "System";
}

type MessageBubbleProps = {
  message: TimelineMessage;
  threadId?: string;
};

export function MessageBubble({ message, threadId }: MessageBubbleProps) {
  const isHuman = message.kind === "human";
  const isApprovalRequest = message.kind === "approval_request";
  const isApprovalResolved = message.kind === "approval_resolved";
  const isSystem = message.kind === "system";
  const isAssistant = isAssistantKind(message.kind);

  if (isApprovalRequest && threadId && message.approval) {
    const approval = message.approval;
    return (
      <div className="flex justify-center px-2 py-2">
        <ApprovalInlineCard
          threadId={threadId}
          approvalId={approval.id}
          title={resolveApprovalTitle(message.contentMarkdown, approval)}
          contentMarkdown={message.contentMarkdown}
          type={approval.type}
          decision={approval.decision}
          requiredRole={resolveApprovalRequiredRole(approval)}
        />
      </div>
    );
  }

  if (isApprovalResolved || isSystem) {
    return (
      <div className="flex justify-center px-2 py-1">
        <div className="max-w-lg rounded-2xl bg-fog px-4 py-2 text-center text-xs text-graphite">
          <MessageContent
            markdown
            className="bg-transparent p-0 text-xs text-graphite"
          >
            {message.contentMarkdown}
          </MessageContent>
        </div>
      </div>
    );
  }

  if (isAssistant && !message.contentMarkdown.trim()) {
    return null;
  }

  const name = authorLabel(message);

  return (
    <Message
      className={cn("items-start", isHuman && "flex-row-reverse")}
    >
      <MessageAvatar
        src=""
        alt={name}
        fallback={isHuman ? "Y" : "A"}
        className={cn(
          isHuman ? "bg-sky-wash text-chart-blue" : "bg-apricot-wash text-rust",
        )}
      />
      <div
        className={cn(
          "flex min-w-0 max-w-[min(100%,42rem)] flex-col gap-1",
          isHuman && "items-end",
        )}
      >
        <MessageContent
          markdown
          className={cn(
            "text-sm",
            isHuman
              ? "rounded-2xl bg-sky-wash px-3.5 py-2.5 text-ink"
              : "bg-transparent p-0 text-ink",
          )}
        >
          {message.contentMarkdown}
        </MessageContent>
      </div>
    </Message>
  );
}

type MessageTimelineProps = {
  threadId: string;
  messages: TimelineMessage[];
  streamingMessages?: StreamingMessageState[];
  emptyState?: ReactNode;
};

export function MessageTimeline({
  threadId,
  messages,
  streamingMessages = [],
  emptyState,
}: MessageTimelineProps) {
  const finalizedIds = new Set(messages.map((m) => m.id));
  const activeStreaming = streamingMessages.filter(
    (s) => s.isStreaming || !finalizedIds.has(s.messageId),
  );

  if (messages.length === 0 && activeStreaming.length === 0) {
    return (
      emptyState ?? (
        <div className="flex flex-1 items-center justify-center py-16 text-sm text-graphite">
          Ask AIDOS about delivery, releases, Jira, approvals, or integrations.
        </div>
      )
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} threadId={threadId} />
      ))}
      {activeStreaming.map((stream) => (
        <StreamingMessageBubble
          key={stream.messageId}
          text={stream.text}
          thinking={stream.thinking}
          activeTool={stream.activeTool}
          isStreaming={stream.isStreaming}
        />
      ))}
    </div>
  );
}
