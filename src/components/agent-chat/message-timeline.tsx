"use client";

import { MarkdownContent } from "@/components/ui/markdown-content";
import { cn } from "@/lib/utils";
import { parseReasoningJson } from "@/lib/agent-chat/types";
import type { ReasoningJson } from "@/lib/agent-chat/types";
import type { AgentChatMessageKind } from "@/generated/prisma/client";
import { ReasoningExpander } from "@/components/agent-chat/reasoning-expander";
import { StreamingMessageBubble } from "@/components/agent-chat/streaming-message";
import type { StreamingMessageState } from "@/components/agent-chat/use-agent-thread-stream";

export type TimelineMessage = {
  id: string;
  kind: AgentChatMessageKind;
  contentMarkdown: string;
  reasoningJson?: string;
  createdAt: Date | string;
  authorUser: { id: string; name: string } | null;
  authorAgent: { id: string; displayName: string } | null;
};

function authorLabel(message: TimelineMessage): string {
  if (message.kind === "human") {
    return message.authorUser?.name ?? "You";
  }
  if (message.authorAgent) {
    return message.authorAgent.displayName;
  }
  return "System";
}

function parseReasoning(json?: string): ReasoningJson {
  return parseReasoningJson(json ?? "{}");
}

export function MessageBubble({ message }: { message: TimelineMessage }) {
  const isHuman = message.kind === "human";
  const isSystem =
    message.kind === "system" ||
    message.kind === "approval_request" ||
    message.kind === "approval_resolved";
  const isAgentReply = message.kind === "agent_reply";
  const reasoning = isAgentReply ? parseReasoning(message.reasoningJson) : null;

  if (isSystem) {
    return (
      <div className="flex justify-center px-2 py-1">
        <div className="max-w-lg rounded-lg border border-white/10 bg-[#131A2A]/80 px-4 py-2 text-center text-xs text-slate-400">
          <MarkdownContent content={message.contentMarkdown} className="text-xs" />
        </div>
      </div>
    );
  }

  if (isAgentReply && !message.contentMarkdown.trim()) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex gap-3 px-1 py-2",
        isHuman ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          isHuman ? "bg-brand/20 text-brand" : "bg-mvp-muted text-mvp",
        )}
      >
        {authorLabel(message).slice(0, 1).toUpperCase()}
      </div>
      <div
        className={cn(
          "max-w-[85%] space-y-1 rounded-xl border px-4 py-3 text-sm",
          isHuman
            ? "border-brand/20 bg-brand/10 text-slate-100"
            : "border-white/10 bg-[#1B2435] text-slate-200",
        )}
      >
        <p className="text-xs font-medium text-slate-400">{authorLabel(message)}</p>
        <MarkdownContent content={message.contentMarkdown} />
        {reasoning && <ReasoningExpander reasoning={reasoning} />}
        <p className="text-[10px] text-slate-500">
          {new Date(message.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

type MessageTimelineProps = {
  messages: TimelineMessage[];
  streamingMessages?: StreamingMessageState[];
  agentNameById?: Record<string, string>;
};

export function MessageTimeline({
  messages,
  streamingMessages = [],
  agentNameById = {},
}: MessageTimelineProps) {
  const finalizedIds = new Set(messages.map((m) => m.id));
  const activeStreaming = streamingMessages.filter(
    (s) => s.isStreaming || !finalizedIds.has(s.messageId),
  );

  if (messages.length === 0 && activeStreaming.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-500">
        No messages yet. Send a message to wake the Super Agent.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {activeStreaming.map((stream) => (
        <StreamingMessageBubble
          key={stream.runId}
          agentName={
            agentNameById[stream.agentId] ??
            messages.find((m) => m.authorAgent?.id === stream.agentId)?.authorAgent
              ?.displayName ??
            "Agent"
          }
          text={stream.text}
          isStreaming={stream.isStreaming}
        />
      ))}
    </div>
  );
}
