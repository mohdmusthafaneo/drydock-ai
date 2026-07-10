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
  return true;
}

/**
 * Fire-and-forget dispatch so queued wakeups are processed without waiting
 * for the next timer scan. Dispatches via pg-boss.
 */
export function pokeAgentWorker(input: {
  organizationId?: string;
  wakeupId?: string;
}): void {
  if (!pokeEnabled()) return;
  if (!input.wakeupId) return;

  void sendAgentWakeupJob({
    wakeupId: input.wakeupId,
    organizationId: input.organizationId,
  }).catch(() => undefined);
}

/**
 * Trigger wakeup processing after enqueue. Delegation uses inline processing
 * when immediate=true; all other sources dispatch a pg-boss job.
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
  });
}
