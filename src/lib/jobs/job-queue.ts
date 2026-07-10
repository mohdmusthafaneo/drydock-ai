import type { PgBoss, SendOptions } from "pg-boss";

import { createLogger } from "@/lib/logger";
import { getBoss } from "./boss";

const log = createLogger({ component: "jobs/queue" });

export type ScheduledJobConfig<T extends object> = {
  name: string;
  cron: string;
  /** Env var holding interval seconds (e.g. CODE_ANALYSIS_ENRICH_INTERVAL_SEC). */
  cronEnvKey?: string;
  handler: (data: T) => Promise<void>;
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  singletonKey?: (data: T) => string | undefined;
};

/** Convert a seconds-based interval to a pg-boss cron expression. */
export function intervalSecToCron(intervalSec: number): string {
  if (intervalSec < 60) return `*/${Math.max(1, intervalSec)} * * * * *`;
  if (intervalSec < 3600) {
    const minutes = Math.max(1, Math.round(intervalSec / 60));
    return `*/${minutes} * * * *`;
  }
  if (intervalSec < 86400) {
    const hours = Math.max(1, Math.round(intervalSec / 3600));
    return `0 */${hours} * * *`;
  }
  return "0 0 * * *";
}

export function resolveCronExpression(
  envKey: string | undefined,
  fallbackCron: string,
): string {
  if (!envKey) return fallbackCron;
  const raw = process.env[envKey]?.trim();
  if (!raw) return fallbackCron;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return intervalSecToCron(parsed);
  }

  // Allow passing a cron expression directly (contains *).
  if (raw.includes("*")) return raw;
  return fallbackCron;
}

async function ensureQueueWithDlq(
  boss: PgBoss,
  name: string,
  options: {
    retryLimit: number;
    retryDelay: number;
    retryBackoff: boolean;
  },
): Promise<void> {
  const dlqName = `${name}.dlq`;
  await boss.createQueue(dlqName);
  await boss.createQueue(name, {
    retryLimit: options.retryLimit,
    retryDelay: options.retryDelay,
    retryBackoff: options.retryBackoff,
    deadLetter: dlqName,
  });
}

/** Factory for pg-boss scheduled jobs with DLQ, schedule, worker, and send helpers. */
export function createScheduledJob<T extends object>(
  config: ScheduledJobConfig<T>,
) {
  const retryLimit = config.retryLimit ?? 3;
  const retryDelay = config.retryDelay ?? 60;
  const retryBackoff = config.retryBackoff ?? true;

  async function ensureQueue(boss: PgBoss): Promise<void> {
    await ensureQueueWithDlq(boss, config.name, {
      retryLimit,
      retryDelay,
      retryBackoff,
    });
  }

  async function ensureSchedule(boss: PgBoss): Promise<void> {
    await ensureQueue(boss);
    const cron = resolveCronExpression(config.cronEnvKey, config.cron);
    await boss.schedule(config.name, cron, {} as T, { key: "default" });
    log.info({ job: config.name, cron }, "schedule ensured");
  }

  async function registerWorker(boss: PgBoss): Promise<void> {
    await ensureQueue(boss);

    await boss.work<T>(config.name, async (jobs) => {
      for (const job of jobs) {
        await config.handler(job.data ?? ({} as T));
      }
    });

    log.info({ job: config.name }, "worker registered");
  }

  async function sendJob(
    data: T = {} as T,
    options?: Partial<SendOptions>,
  ): Promise<string | null> {
    const boss = await getBoss();
    const singletonKey = config.singletonKey?.(data);

    return boss.send(config.name, data, {
      singletonKey,
      retryLimit,
      retryDelay,
      retryBackoff,
      ...options,
    });
  }

  return {
    name: config.name,
    ensureSchedule,
    registerWorker,
    sendJob,
  };
}
