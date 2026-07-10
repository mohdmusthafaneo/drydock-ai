import { createLogger } from "@/lib/logger";
import { getBoss, isPgBossEnabled } from "./boss";
import {
  registerAgentTimerScanWorker,
  registerAgentWakeupWorker,
} from "./agent-wakeup-job";
import {
  ensureGrafanaSyncSchedule,
  registerGrafanaSyncWorker,
} from "./grafana-sync-job";

const log = createLogger({ component: "jobs/bootstrap" });

export type ProcessRole = "web" | "worker";

/**
 * Start pg-boss and register role-appropriate schedules/workers.
 * Web: boss started for send() + cron schedules. Worker: work handlers.
 */
export async function bootstrapJobInfrastructure(
  role: ProcessRole,
): Promise<void> {
  if (!isPgBossEnabled()) {
    log.info({ role }, "pg-boss disabled — skipping job bootstrap");
    return;
  }

  const boss = await getBoss();

  if (role === "web") {
    await ensureGrafanaSyncSchedule(boss);
    log.info("web role: pg-boss schedules registered");
    return;
  }

  await registerAgentWakeupWorker(boss);
  await registerAgentTimerScanWorker(boss);
  await registerGrafanaSyncWorker(boss);
  await ensureGrafanaSyncSchedule(boss);
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
