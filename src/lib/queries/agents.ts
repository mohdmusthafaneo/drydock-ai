"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./fetch";
import { agentKeys } from "./keys";
import type { AgentDetailResponse, AgentsListResponse } from "./types";

const AGENTS_POLL_MS = 5000;

function agentsNeedPolling(agents: AgentsListResponse["agents"] | undefined) {
  if (!agents?.length) return false;
  return agents.some(
    (agent) => agent.status === "RUNNING" || agent.pendingWakeups > 0,
  );
}

function agentDetailNeedsPolling(agent: AgentDetailResponse["agent"] | undefined) {
  if (!agent) return false;
  return agent.status === "RUNNING" || agent.pendingWakeups > 0;
}

export function useAgentsQuery() {
  return useQuery({
    queryKey: agentKeys.list(),
    queryFn: () => apiFetch<AgentsListResponse>("/api/agents"),
    refetchInterval: (query) =>
      agentsNeedPolling(query.state.data?.agents) ? AGENTS_POLL_MS : false,
  });
}

export function useAgentDetailQuery(agentId: string) {
  return useQuery({
    queryKey: agentKeys.detail(agentId),
    queryFn: () => apiFetch<AgentDetailResponse>(`/api/agents/${agentId}`),
    refetchInterval: (query) =>
      agentDetailNeedsPolling(query.state.data?.agent) ? AGENTS_POLL_MS : false,
  });
}
