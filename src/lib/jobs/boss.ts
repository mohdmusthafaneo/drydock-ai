import { PgBoss } from "pg-boss";

import { createLogger } from "@/lib/logger";
import { PGBOSS_SCHEMA } from "./constants";

let bossInstance: PgBoss | null = null;
let bossStartPromise: Promise<PgBoss> | null = null;

const log = createLogger({ component: "pg-boss" });

export function isPgBossEnabled(): boolean {
  if (process.env.PG_BOSS_ENABLED === "false") return false;
  return Boolean(process.env.DATABASE_URL?.trim());
}

function resolveConnectionString(): string {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for pg-boss");
  }
  return connectionString;
}

/** Lazy pg-boss singleton — started once per process on first use. */
export async function getBoss(): Promise<PgBoss> {
  if (bossInstance) return bossInstance;
  if (!bossStartPromise) {
    bossStartPromise = startBoss();
  }
  return bossStartPromise;
}

async function startBoss(): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: resolveConnectionString(),
    schema: PGBOSS_SCHEMA,
  });

  boss.on("error", (error) => {
    log.error({ err: error }, "pg-boss error");
  });

  boss.on("warning", (warning) => {
    log.warn({ warning }, "pg-boss warning");
  });

  await boss.start();
  bossInstance = boss;
  log.info({ schema: PGBOSS_SCHEMA }, "pg-boss started");
  return boss;
}

/** Stop pg-boss gracefully — for worker shutdown hooks. */
export async function stopBoss(): Promise<void> {
  if (!bossInstance) return;
  await bossInstance.stop({ graceful: true, timeout: 10_000 });
  bossInstance = null;
  bossStartPromise = null;
  log.info("pg-boss stopped");
}
