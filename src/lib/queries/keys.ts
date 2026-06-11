/**
 * TanStack Query key factory for agent control-plane and agent-thread surfaces.
 * Keys are org-scoped via same-origin session cookies — do not embed organizationId.
 */

export const agentKeys = {
  all: ["agents"] as const,
  list: () => [...agentKeys.all, "list"] as const,
  detail: (agentId: string) => [...agentKeys.all, "detail", agentId] as const,
};

export const runKeys = {
  all: ["agent-runs"] as const,
  list: (agentId: string, limit?: number) =>
    [...runKeys.all, agentId, "list", limit ?? 50] as const,
  detail: (agentId: string, runId: string) =>
    [...runKeys.all, agentId, "detail", runId] as const,
};

export const threadKeys = {
  all: ["agent-threads"] as const,
  list: (status: "open" | "done" | "all") =>
    [...threadKeys.all, "list", status] as const,
  detail: (threadId: string) => [...threadKeys.all, "detail", threadId] as const,
};
