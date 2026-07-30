"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentThreadQuery } from "@/lib/queries/threads";
import {
  invalidateThreadDetail,
  invalidateThreadList,
} from "@/lib/queries/invalidate";
import {
  beginBootstrap,
  clearPendingMessage,
  endBootstrap,
  peekPendingMessage,
} from "@/lib/agent-chat/pending-message";
import { QueryPanelError } from "@/components/ui/query-panel-state";
import { MessageTimeline } from "@/components/agent-chat/message-timeline";
import {
  CHAT_STARTER_SUGGESTIONS,
  ComposeBox,
} from "@/components/agent-chat/compose-box";
import { useAgentThreadStream } from "@/components/agent-chat/use-agent-thread-stream";
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from "@/components/prompt-kit/chat-container";
import { ScrollButton } from "@/components/prompt-kit/scroll-button";
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion";
import { Button } from "@/components/ui/button";

type ThreadDetailPanelProps = {
  threadId: string;
};

export function ThreadDetailPanel({ threadId }: ThreadDetailPanelProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } =
    useAgentThreadQuery(threadId);
  const clearStreamingRef = useRef<(() => void) | null>(null);

  const onMessageFinal = useCallback(async () => {
    await invalidateThreadDetail(queryClient, threadId);
    clearStreamingRef.current?.();
  }, [queryClient, threadId]);

  const onHumanMessageSaved = useCallback(() => {
    void invalidateThreadList(queryClient);
    void invalidateThreadDetail(queryClient, threadId);
  }, [queryClient, threadId]);

  const {
    streamingMessages,
    optimisticHuman,
    sendMessage,
    regenerate,
    stop,
    sending,
    clearStreaming,
    error: streamError,
  } = useAgentThreadStream(threadId, {
    onMessageFinal,
    onHumanMessageSaved,
  });

  clearStreamingRef.current = clearStreaming;

  useEffect(() => {
    const pending = peekPendingMessage(threadId);
    if (!pending) return;
    if (!beginBootstrap(threadId)) return;

    void sendMessage(pending)
      .then((ok) => {
        if (ok) clearPendingMessage(threadId);
      })
      .finally(() => {
        endBootstrap(threadId);
      });
  }, [threadId, sendMessage]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-graphite">
        Loading conversation…
      </div>
    );
  }

  if (isError || !data?.thread) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <QueryPanelError
          message={
            error instanceof Error ? error.message : "Failed to load conversation"
          }
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const thread = data.thread;
  const isDone = thread.status === "done";

  const optimisticAlreadyPersisted =
    !!optimisticHuman &&
    thread.messages.some(
      (m) =>
        m.id === optimisticHuman.id ||
        (m.kind === "human" && m.contentMarkdown === optimisticHuman.content),
    );

  const timelineMessages = [
    ...thread.messages,
    ...(optimisticHuman && !optimisticAlreadyPersisted
      ? [
          {
            id: optimisticHuman.id,
            kind: "human" as const,
            contentMarkdown: optimisticHuman.content,
            createdAt: new Date().toISOString(),
            authorUser: { id: "me", name: "You" },
          },
        ]
      : []),
  ];

  const lastMessage = timelineMessages[timelineMessages.length - 1];
  const hasStreamBubble = streamingMessages.some(
    (s) => s.isStreaming || s.thinking || Boolean(s.text.trim()),
  );
  const needsRetry =
    !isDone &&
    !sending &&
    !hasStreamBubble &&
    !!lastMessage &&
    lastMessage.kind === "human";

  const isEmpty =
    timelineMessages.length === 0 && streamingMessages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <ChatContainerRoot className="relative flex-1">
          <ChatContainerContent className="gap-4 px-3 py-4 sm:px-6">
            <MessageTimeline
              threadId={thread.id}
              messages={timelineMessages}
              streamingMessages={streamingMessages}
              emptyState={
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div>
                    <p className="font-display text-xl text-ink">AIDOS</p>
                    <p className="mt-1 text-sm text-ash">
                      Ask about Jira, releases, or the latest QA / DevOps /
                      productivity / governance analysis runs.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {CHAT_STARTER_SUGGESTIONS.map((suggestion) => (
                      <PromptSuggestion
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        className="rounded-full border-border bg-pure-white"
                        disabled={sending}
                        onClick={() => void sendMessage(suggestion)}
                      >
                        {suggestion}
                      </PromptSuggestion>
                    ))}
                  </div>
                </div>
              }
            />
            {needsRetry ? (
              <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-fog px-4 py-3">
                <p className="text-sm text-ash">
                  AIDOS didn&apos;t reply to this message.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ink"
                  className="shrink-0 rounded-full"
                  onClick={() => void regenerate()}
                >
                  Retry
                </Button>
              </div>
            ) : null}
            <ChatContainerScrollAnchor />
          </ChatContainerContent>
          {!isEmpty ? (
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <ScrollButton className="border border-border bg-pure-white shadow-sm" />
            </div>
          ) : null}
        </ChatContainerRoot>
      </div>
      <div className="shrink-0 border-t border-border-subtle">
        <ComposeBox
          isDone={isDone}
          sending={sending}
          error={streamError}
          onSend={sendMessage}
          onStop={stop}
        />
      </div>
    </div>
  );
}
