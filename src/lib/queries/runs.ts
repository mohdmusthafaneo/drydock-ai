"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./fetch";
import { runKeys } from "./keys";
import {
  TERMINAL_RUN_STATUSES,
  type AgentRunsResponse,
  type RunDetailResponse,
} from "./types";

const RUNS_POLL_MS = 5000;
const RUN_DETAIL_POLL_MS = 3000;

export function useAgentRunsQuery(agentId: string, limit = 50) {
  return useQuery({
    queryKey: runKeys.list(agentId, limit),
    queryFn: () =>
      apiFetch<AgentRunsResponse>(`/api/agents/${agentId}/runs?limit=${limit}`),
    refetchInterval: (query) => {
      const latest = query.state.data?.runs[0];
      if (!latest) return false;
      return TERMINAL_RUN_STATUSES.has(latest.status) ? false : RUNS_POLL_MS;
    },
  });
}

export function useRunDetailQuery(agentId: string, runId: string) {
  return useQuery({
    queryKey: runKeys.detail(agentId, runId),
    queryFn: () =>
      apiFetch<RunDetailResponse>(`/api/agents/${agentId}/runs/${runId}`),
    refetchInterval: (query) => {
      const status = query.state.data?.run.status;
      if (!status) return false;
      return TERMINAL_RUN_STATUSES.has(status) ? false : RUN_DETAIL_POLL_MS;
    },
  });
}
