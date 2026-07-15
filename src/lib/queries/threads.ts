"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./fetch";
import { threadKeys } from "./keys";
import type {
  AgentThreadDetailResponse,
  AgentThreadsListResponse,
} from "./types";

/** List refreshes on focus / invalidate — streaming owns live updates. */
export function useAgentThreadsQuery(status: "open" | "done") {
  return useQuery({
    queryKey: threadKeys.list(status),
    queryFn: () =>
      apiFetch<AgentThreadsListResponse>(`/api/agent-threads?status=${status}`),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useAgentThreadQuery(threadId: string) {
  return useQuery({
    queryKey: threadKeys.detail(threadId),
    queryFn: () =>
      apiFetch<AgentThreadDetailResponse>(`/api/agent-threads/${threadId}`),
    enabled: Boolean(threadId),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}
