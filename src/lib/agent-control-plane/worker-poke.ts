import { resolveAidosApiBaseUrl } from "./llm/config";
import { isLegacyAgentDrainEnabled, isPgBossEnabled } from "@/lib/jobs/boss";
import { sendAgentWakeupJob } from "@/lib/jobs/agent-wakeup-job";

export type TriggerWakeupProcessingInput = {
  organizationId: string;
  wakeupId: string;
  /** Process inline in the current process (used for delegation during agent runs). */
  immediate?: boolean;
};

function pokeEnabled(): boolean {
  if (process.env.AGENT_WORKER_ENABLED === "false") return false;
  if (process.env.AGENT_WORKER_POKE_ON_ENQUEUE === "false") return false;
  if (isPgBossEnabled() && !isLegacyAgentDrainEnabled()) return true;
  return Boolean(process.env.PLATFORM_WORKER_SECRET?.trim());
}

/**
 * Fire-and-forget dispatch so queued wakeups are processed without waiting
 * for the next cron tick. Uses pg-boss when enabled, else HTTP poke.
 */
export function pokeAgentWorker(input: {
  organizationId?: string;
  wakeupId?: string;
  limit?: number;
}): void {
  if (!pokeEnabled()) return;

  if (isPgBossEnabled() && !isLegacyAgentDrainEnabled()) {
    if (!input.wakeupId) return;
    void sendAgentWakeupJob({
      wakeupId: input.wakeupId,
      organizationId: input.organizationId,
    }).catch(() => undefined);
    return;
  }

  const secret = process.env.PLATFORM_WORKER_SECRET!.trim();
  const baseUrl = resolveAidosApiBaseUrl();

  void fetch(`${baseUrl}/api/cron/agents/worker`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organizationId: input.organizationId,
      wakeupId: input.wakeupId,
      limit: input.limit,
    }),
  }).catch(() => undefined);
}

/**
 * Trigger wakeup processing after enqueue. Delegation uses inline processing
 * when immediate=true; all other sources poke the worker (pg-boss or HTTP).
 */
export async function triggerWakeupProcessing(
  input: TriggerWakeupProcessingInput,
): Promise<void> {
  if (process.env.AGENT_WORKER_ENABLED === "false") return;

  if (input.immediate) {
    const { processWakeupById } = await import("./worker");
    void processWakeupById(input.wakeupId).catch(() => undefined);
    return;
  }

  pokeAgentWorker({
    organizationId: input.organizationId,
    wakeupId: input.wakeupId,
    limit: 1,
  });
}
