import { createLogger } from "@/lib/logger";
import { getBoss } from "./boss";
import {
  registerAgentTimerScanWorker,
  registerAgentWakeupWorker,
} from "./agent-wakeup-job";
import {
  ensureAllDomainSchedules,
  registerAllDomainWorkers,
} from "./domain-scheduled-jobs";

const log = createLogger({ component: "jobs/bootstrap" });

export type ProcessRole = "web" | "worker";

/**
 * Start pg-boss and register role-appropriate schedules/workers.
 * Web: boss started for send() + cron schedules. Worker: work handlers.
 */
export async function bootstrapJobInfrastructure(
  role: ProcessRole,
): Promise<void> {
  const boss = await getBoss();

  if (role === "web") {
    await ensureAllDomainSchedules(boss);
    log.info("web role: pg-boss schedules registered");
    return;
  }

  await registerAgentWakeupWorker(boss);
  await registerAgentTimerScanWorker(boss);
  await registerAllDomainWorkers(boss);
  await ensureAllDomainSchedules(boss);
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
