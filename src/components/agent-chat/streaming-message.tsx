"use client";

import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/prompt-kit/message";
import { ThinkingBar } from "@/components/prompt-kit/thinking-bar";

function thinkingLabel(activeTool?: string): string {
  if (!activeTool) return "Thinking";
  const name = activeTool.replace(/^aidos_/, "").replace(/_/g, " ");
  return `${name}…`;
}

export function StreamingMessageBubble({
  text,
  thinking,
  activeTool,
  isStreaming,
}: {
  text: string;
  thinking?: boolean;
  activeTool?: string;
  isStreaming: boolean;
}) {
  const showThinking =
    thinking || (isStreaming && !text.trim());

  return (
    <Message className="items-start">
      <MessageAvatar
        src=""
        alt="AIDOS"
        fallback="A"
        className="bg-apricot-wash text-rust"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {showThinking ? (
          <ThinkingBar text={thinkingLabel(activeTool)} className="py-1" />
        ) : null}
        {text ? (
          <MessageContent
            markdown
            className="max-w-[min(100%,42rem)] bg-transparent p-0 text-sm text-ink"
          >
            {text}
          </MessageContent>
        ) : null}
      </div>
    </Message>
  );
}
