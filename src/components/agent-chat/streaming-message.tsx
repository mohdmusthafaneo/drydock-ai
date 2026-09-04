"use client";

import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/prompt-kit/message";
import {
  ThoughtPanel,
  type ThoughtToolState,
} from "@/components/agent-chat/thought-panel";

export function StreamingMessageBubble({
  text,
  thinking,
  thinkingText,
  tools,
  isStreaming,
}: {
  text: string;
  thinking?: boolean;
  thinkingText?: string;
  tools?: ThoughtToolState[];
  isStreaming: boolean;
}) {
  const hasThought =
    Boolean(thinkingText?.trim()) ||
    Boolean(tools && tools.length > 0) ||
    Boolean(thinking) ||
    (isStreaming && !text.trim());

  const isThoughtStreaming =
    Boolean(thinking) || (isStreaming && !text.trim());

  return (
    <Message className="items-start">
      <MessageAvatar
        src=""
        alt="DryDock"
        fallback="D"
        className="bg-apricot-wash text-rust"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {hasThought ? (
          <ThoughtPanel
            thinkingText={thinkingText}
            tools={tools}
            isStreaming={isThoughtStreaming}
          />
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
