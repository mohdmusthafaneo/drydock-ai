import { createLogger } from "@/lib/logger";
import { getBoss } from "./boss";
import {
  registerAgentTimerScanWorker,
  registerAgentWakeupWorker,
} from "./agent-wakeup-job";
import {
  ensureAllDomainFanoutSchedules,
  registerAllDomainFanoutWorkers,
} from "./domain-fanout-jobs";
import { registerMlWorkers } from "./ml-jobs";
import {
  ensureEvidenceSchedule,
  registerEvidenceWorkers,
} from "./evidence-jobs";
import {
  ensureRetentionSchedule,
  registerRetentionWorkers,
} from "./retention-jobs";
import { refreshFanoutJobs } from "./refresh-fanout-job";
import { parseWorkerQueues, workerServesRole } from "./worker-queues";

const log = createLogger({ component: "jobs/bootstrap" });

export type ProcessRole = "web" | "worker";

/**
 * Start pg-boss and register role-appropriate schedules/workers.
 * Web: boss started for send() + cron schedules. Worker: work handlers.
 * Worker queue subsets are selected via WORKER_QUEUES (default: all).
 */
export async function bootstrapJobInfrastructure(
  role: ProcessRole,
): Promise<void> {
  const boss = await getBoss();

  if (role === "web") {
    await refreshFanoutJobs.ensureSchedule(boss);
    await ensureAllDomainFanoutSchedules(boss);
    await ensureEvidenceSchedule(boss);
    await ensureRetentionSchedule(boss);
    log.info("web role: pg-boss schedules registered");
    return;
  }

  const queues = parseWorkerQueues();
  log.info({ queues: [...queues] }, "worker queue roles");

  if (workerServesRole(queues, "agents")) {
    await registerAgentWakeupWorker(boss);
    await registerAgentTimerScanWorker(boss);
  }

  if (workerServesRole(queues, "refresh")) {
    await refreshFanoutJobs.registerWorker(boss);
    await refreshFanoutJobs.ensureSchedule(boss);
  }

  if (workerServesRole(queues, "enrich")) {
    await registerAllDomainFanoutWorkers(boss);
    await ensureAllDomainFanoutSchedules(boss);
  }

  if (workerServesRole(queues, "ml")) {
    await registerMlWorkers(boss);
    await registerEvidenceWorkers(boss);
  }

  if (workerServesRole(queues, "retention")) {
    await registerRetentionWorkers(boss);
    await ensureRetentionSchedule(boss);
  }

  // When serving "all", refresh/enrich schedules are already ensured above.
  // Dedicated role pools still need schedules on a process that owns them —
  // web also registers schedules so cron fires even if only an `ml` worker runs.
  if (queues.has("all")) {
    await refreshFanoutJobs.ensureSchedule(boss);
    await ensureAllDomainFanoutSchedules(boss);
    await ensureEvidenceSchedule(boss);
    await ensureRetentionSchedule(boss);
  }

  log.info("worker role: pg-boss work handlers registered");
}

/** Long-running worker process entry — blocks until SIGTERM. */
export async function runJobWorkerProcess(): Promise<void> {
  await bootstrapJobInfrastructure("worker");
  log.info("pg-boss worker process running");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down pg-boss worker");
    const { stopBoss } = await import("./boss");
    await stopBoss();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await new Promise(() => undefined);
}
