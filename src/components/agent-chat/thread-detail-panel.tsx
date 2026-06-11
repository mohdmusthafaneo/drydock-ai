"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentThreadQuery } from "@/lib/queries/threads";
import { invalidateThreadDetail } from "@/lib/queries/invalidate";
import { DataRefreshButton } from "@/components/ui/data-refresh-button";
import { QueryPanelError, QueryPanelLoading } from "@/components/ui/query-panel-state";
import { ThreadStatusBadge } from "@/components/agent-chat/thread-status-badge";
import { MessageTimeline } from "@/components/agent-chat/message-timeline";
import { ComposeBox } from "@/components/agent-chat/compose-box";
import {
  ParticipantStrip,
  invitedSpecialists,
} from "@/components/agent-chat/participant-strip";
import { useAgentThreadStream } from "@/components/agent-chat/use-agent-thread-stream";
import { LIVE_THREAD_STATUSES } from "@/lib/queries/types";
import { MarkdownContent } from "@/components/ui/markdown-content";

type ThreadDetailPanelProps = {
  threadId: string;
};

export function ThreadDetailPanel({ threadId }: ThreadDetailPanelProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } =
    useAgentThreadQuery(threadId);

  const isLive = LIVE_THREAD_STATUSES.has(data?.thread.status ?? "open");

  const onMessageFinal = useCallback(
    (messageId: string) => {
      void invalidateThreadDetail(queryClient, threadId);
    },
    [queryClient, threadId],
  );

  const { streamingMessages, connected, disconnected, clearCompletedStreaming } =
    useAgentThreadStream(threadId, {
      enabled: isLive || Boolean(data?.thread),
      onMessageFinal: (id) => {
        onMessageFinal(id);
        clearCompletedStreaming(id);
      },
    });

  const agentNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of data?.thread.participants ?? []) {
      if (p.agent) map[p.agent.id] = p.agent.displayName;
    }
    return map;
  }, [data?.thread.participants]);

  if (isLoading) {
    return <QueryPanelLoading label="Loading thread…" />;
  }

  if (isError || !data?.thread) {
    return (
      <QueryPanelError
        message={error instanceof Error ? error.message : "Failed to load thread"}
        onRetry={() => void refetch()}
      />
    );
  }

  const thread = data.thread;
  const mentionableAgents = invitedSpecialists(thread.participants);
  const isDone = thread.status === "done";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold sm:text-2xl">{thread.title}</h1>
          <ThreadStatusBadge status={thread.status} />
          {connected && (
            <span className="text-xs text-brand">Live stream connected</span>
          )}
          {disconnected && isLive && (
            <span className="text-xs text-amber-400/90">
              Agent still working… (reconnecting)
            </span>
          )}
          {!connected && !disconnected && isLive && (
            <span className="text-xs text-slate-500">Polling for updates</span>
          )}
        </div>
        <DataRefreshButton
          onRefresh={() => void refetch()}
          isFetching={isFetching}
          dataUpdatedAt={dataUpdatedAt}
        />
      </div>

      {isDone && thread.contextSummary?.trim() && (
        <div className="mt-3 rounded-lg border border-white/10 bg-[#131A2A]/80 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Closure summary
          </p>
          <div className="mt-1 text-sm text-slate-300">
            <MarkdownContent content={thread.contextSummary} />
          </div>
          {thread.closedAt && (
            <p className="mt-2 text-xs text-slate-500">
              Closed {new Date(thread.closedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      <ParticipantStrip participants={thread.participants} className="mt-2" />

      <div className="flex min-h-[50vh] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#131A2A]/30">
        <div className="flex-1 overflow-y-auto p-4">
          <MessageTimeline
            threadId={thread.id}
            messages={thread.messages}
            streamingMessages={streamingMessages}
            agentNameById={agentNameById}
          />
        </div>
        <ComposeBox
          threadId={thread.id}
          mentionableAgents={mentionableAgents}
          isDone={isDone}
        />
      </div>
    </>
  );
}
