import type { PgBoss } from "pg-boss";

import { runScheduledGrafanaSync } from "@/lib/grafana-scheduled-sync";
import { createLogger } from "@/lib/logger";
import { JOB_NAMES } from "./constants";

const log = createLogger({ component: "jobs/grafana-sync" });

/** Every 15 minutes — matches runScheduledGrafanaSync internal throttle. */
const GRAFANA_SYNC_CRON = "*/15 * * * *";

async function ensureGrafanaSyncQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(JOB_NAMES.grafanaSync, {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    deadLetter: `${JOB_NAMES.grafanaSync}.dlq`,
  });
}

export async function ensureGrafanaSyncSchedule(boss: PgBoss): Promise<void> {
  await ensureGrafanaSyncQueue(boss);
  await boss.schedule(
    JOB_NAMES.grafanaSync,
    GRAFANA_SYNC_CRON,
    {},
    { key: "default" },
  );
  log.info({ cron: GRAFANA_SYNC_CRON }, "grafana.sync schedule ensured");
}

export async function registerGrafanaSyncWorker(boss: PgBoss): Promise<void> {
  await ensureGrafanaSyncQueue(boss);

  await boss.work<{ organizationId?: string }>(
    JOB_NAMES.grafanaSync,
    async (jobs) => {
      for (const job of jobs) {
        const result = await runScheduledGrafanaSync({
          organizationId: job.data?.organizationId,
        });
        log.info(
          {
            attempted: result.attempted,
            synced: result.synced,
            skipped: result.skipped,
            failed: result.failed,
          },
          "grafana.sync job complete",
        );
      }
    },
  );

  log.info("registered grafana.sync worker");
}

/** Trigger an on-demand Grafana sync job (e.g. from API). */
export async function sendGrafanaSyncJob(input?: {
  organizationId?: string;
}): Promise<void> {
  const { getBoss } = await import("./boss");

  const boss = await getBoss();
  await boss.send(JOB_NAMES.grafanaSync, input ?? {}, {
    singletonKey: input?.organizationId
      ? `grafana:${input.organizationId}`
      : "grafana:all",
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
  });
}
