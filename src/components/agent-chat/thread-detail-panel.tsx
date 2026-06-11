"use client";

import { useAgentThreadQuery } from "@/lib/queries/threads";
import { DataRefreshButton } from "@/components/ui/data-refresh-button";
import { QueryPanelError, QueryPanelLoading } from "@/components/ui/query-panel-state";
import { ThreadStatusBadge } from "@/components/agent-chat/thread-status-badge";
import { MessageTimeline } from "@/components/agent-chat/message-timeline";
import { ComposeBox } from "@/components/agent-chat/compose-box";
import {
  ParticipantStrip,
  invitedSpecialists,
} from "@/components/agent-chat/participant-strip";
import { LIVE_THREAD_STATUSES } from "@/lib/queries/types";

type ThreadDetailPanelProps = {
  threadId: string;
};

export function ThreadDetailPanel({ threadId }: ThreadDetailPanelProps) {
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } =
    useAgentThreadQuery(threadId);

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
  const isLive = LIVE_THREAD_STATUSES.has(thread.status);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold sm:text-2xl">{thread.title}</h1>
          <ThreadStatusBadge status={thread.status} />
          {isLive && (
            <span className="text-xs text-brand">Live — polling for updates</span>
          )}
        </div>
        <DataRefreshButton
          onRefresh={() => void refetch()}
          isFetching={isFetching}
          dataUpdatedAt={dataUpdatedAt}
        />
      </div>

      <ParticipantStrip participants={thread.participants} className="mt-2" />

      <div className="flex min-h-[50vh] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#131A2A]/30">
        <div className="flex-1 overflow-y-auto p-4">
          <MessageTimeline messages={thread.messages} />
        </div>
        <ComposeBox threadId={thread.id} mentionableAgents={mentionableAgents} />
      </div>
    </>
  );
}
