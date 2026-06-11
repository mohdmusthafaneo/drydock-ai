import type { QueryClient } from "@tanstack/react-query";
import { agentKeys, runKeys, threadKeys } from "./keys";

export function invalidateAgentList(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: agentKeys.all });
}

export function invalidateAgentDetail(queryClient: QueryClient, agentId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) }),
    queryClient.invalidateQueries({ queryKey: runKeys.list(agentId) }),
    invalidateAgentList(queryClient),
  ]);
}

export function invalidateRunDetail(
  queryClient: QueryClient,
  agentId: string,
  runId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: runKeys.detail(agentId, runId) }),
    queryClient.invalidateQueries({ queryKey: runKeys.list(agentId) }),
    queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) }),
    invalidateAgentList(queryClient),
  ]);
}

export function invalidateThreadList(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: threadKeys.all });
}

export function invalidateThreadDetail(queryClient: QueryClient, threadId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: threadKeys.detail(threadId) }),
    invalidateThreadList(queryClient),
  ]);
}
