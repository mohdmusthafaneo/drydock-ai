import { getEnv } from "@/lib/env";

/** Queue role groups selectable via WORKER_QUEUES (comma-separated). */
export const WORKER_QUEUE_ROLES = ["all", "agents", "refresh", "enrich", "ml"] as const;
export type WorkerQueueRole = (typeof WORKER_QUEUE_ROLES)[number];

/**
 * Parse WORKER_QUEUES env. Default `all` registers every worker handler.
 * Examples: `ml`, `agents,ml`, `refresh,enrich`.
 */
export function parseWorkerQueues(
  raw: string | undefined = process.env.WORKER_QUEUES,
): Set<WorkerQueueRole> {
  const value = (raw ?? getEnv().WORKER_QUEUES ?? "all").trim().toLowerCase();
  if (!value || value === "all") {
    return new Set<WorkerQueueRole>(["all"]);
  }

  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean) as WorkerQueueRole[];

  const valid = new Set<WorkerQueueRole>();
  for (const part of parts) {
    if ((WORKER_QUEUE_ROLES as readonly string[]).includes(part)) {
      valid.add(part);
    }
  }
  if (valid.size === 0) {
    return new Set<WorkerQueueRole>(["all"]);
  }
  return valid;
}

export function workerServesRole(
  roles: Set<WorkerQueueRole>,
  role: Exclude<WorkerQueueRole, "all">,
): boolean {
  return roles.has("all") || roles.has(role);
}
