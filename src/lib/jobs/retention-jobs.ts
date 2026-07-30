import type { PgBoss } from "pg-boss";

import { asSystem } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { JOB_NAMES } from "./constants";
import { createScheduledJob } from "./job-queue";

const log = createLogger({ component: "jobs/retention" });

/** Default retention windows — aligned with the Timescale migration. */
export const RETENTION_POLICIES = [
  { table: "TelemetryMetric", interval: "90 days" },
  { table: "TelemetryEvent", interval: "90 days" },
  { table: "WebhookEvent", interval: "30 days" },
  { table: "DeploymentEvent", interval: "365 days" },
  { table: "AuditLog", interval: "365 days" },
  { table: "ActivityEvent", interval: "180 days" },
] as const;

type HypertableRow = { hypertable_name: string };

/**
 * Ensure Timescale retention policies exist (idempotent). Safe on a daily
 * schedule so restored DBs pick up policies without re-running migrations.
 */
export async function ensureTimescaleRetentionPolicies(): Promise<{
  hypertables: number;
  ensured: number;
  skipped: number;
}> {
  const db = asSystem();

  const hypertables = await db.$queryRaw<HypertableRow[]>`
    SELECT hypertable_name::text AS hypertable_name
    FROM timescaledb_information.hypertables
    WHERE hypertable_schema = 'public'
  `.catch((err) => {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "timescaledb_information.hypertables unavailable",
    );
    return [] as HypertableRow[];
  });

  const hypertableNames = new Set(
    hypertables.map((r) => r.hypertable_name.replace(/^"|"$/g, "")),
  );

  let ensured = 0;
  let skipped = 0;

  for (const policy of RETENTION_POLICIES) {
    if (!hypertableNames.has(policy.table)) {
      skipped += 1;
      continue;
    }

    try {
      // if_not_exists keeps this idempotent across schedule ticks.
      await db.$executeRawUnsafe(
        `SELECT add_retention_policy('"${policy.table}"', INTERVAL '${policy.interval}', if_not_exists => true)`,
      );
      ensured += 1;
    } catch (err) {
      log.warn(
        {
          table: policy.table,
          err: err instanceof Error ? err.message : String(err),
        },
        "retention policy ensure failed",
      );
      skipped += 1;
    }
  }

  return { hypertables: hypertableNames.size, ensured, skipped };
}

export const retentionEnsureJob = createScheduledJob({
  name: JOB_NAMES.retentionEnsure,
  cron: "0 4 * * *",
  cronEnvKey: "RETENTION_ENSURE_INTERVAL_SEC",
  handler: async () => {
    const result = await ensureTimescaleRetentionPolicies();
    log.info(result, "retention.ensure complete");
  },
  retryLimit: 2,
  retryDelay: 60,
});

export async function ensureRetentionSchedule(boss: PgBoss): Promise<void> {
  await retentionEnsureJob.ensureSchedule(boss);
}

export async function registerRetentionWorkers(boss: PgBoss): Promise<void> {
  await retentionEnsureJob.registerWorker(boss);
}

export async function enqueueRetentionEnsure(): Promise<string | null> {
  return retentionEnsureJob.sendJob({});
}
