"use client";

import { useAgentThreadsQuery } from "@/lib/queries/threads";
import { DataRefreshButton } from "@/components/ui/data-refresh-button";
import { QueryPanelError, QueryPanelLoading } from "@/components/ui/query-panel-state";
import { ThreadList } from "@/components/agent-chat/thread-list";

type ThreadListPanelProps = {
  status: "open" | "done";
  emptyLabel: string;
};

export function ThreadListPanel({ status, emptyLabel }: ThreadListPanelProps) {
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } =
    useAgentThreadsQuery(status);

  if (isLoading) {
    return <QueryPanelLoading label="Loading threads…" />;
  }

  if (isError) {
    return (
      <QueryPanelError
        message={error instanceof Error ? error.message : "Failed to load threads"}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DataRefreshButton
          onRefresh={() => void refetch()}
          isFetching={isFetching}
          dataUpdatedAt={dataUpdatedAt}
        />
      </div>
      <ThreadList threads={data?.threads ?? []} emptyLabel={emptyLabel} />
    </div>
  );
}
