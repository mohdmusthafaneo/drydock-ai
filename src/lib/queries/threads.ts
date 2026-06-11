"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./fetch";
import { threadKeys } from "./keys";
import {
  LIVE_THREAD_STATUSES,
  type AgentThreadDetailResponse,
  type AgentThreadsListResponse,
  type ThreadListItemResponse,
} from "./types";

const THREADS_POLL_MS = 5000;

function threadListNeedsPolling(
  status: "open" | "done",
  threads: ThreadListItemResponse[] | undefined,
) {
  if (status !== "open" || !threads?.length) return false;
  return threads.some((thread) => LIVE_THREAD_STATUSES.has(thread.status));
}

export function useAgentThreadsQuery(status: "open" | "done") {
  return useQuery({
    queryKey: threadKeys.list(status),
    queryFn: () =>
      apiFetch<AgentThreadsListResponse>(`/api/agent-threads?status=${status}`),
    refetchInterval: (query) =>
      threadListNeedsPolling(status, query.state.data?.threads)
        ? THREADS_POLL_MS
        : false,
  });
}

export function useAgentThreadQuery(threadId: string) {
  return useQuery({
    queryKey: threadKeys.detail(threadId),
    queryFn: () =>
      apiFetch<AgentThreadDetailResponse>(`/api/agent-threads/${threadId}`),
    refetchInterval: (query) => {
      const threadStatus = query.state.data?.thread.status;
      if (!threadStatus) return false;
      return LIVE_THREAD_STATUSES.has(threadStatus) ? THREADS_POLL_MS : false;
    },
  });
}
