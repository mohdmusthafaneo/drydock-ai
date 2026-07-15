import { asSystem, isReadReplicaConfigured } from "@/lib/prisma";
import { getCacheBackend } from "@/lib/cache";
import { getBoss } from "@/lib/jobs/boss";
import { JOB_NAMES } from "@/lib/jobs/constants";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "internal-health" });

const STALE_SYNC_MS = 24 * 60 * 60 * 1000;

export type QueueHealth = {
  name: string;
  queuedCount: number;
  readyCount: number;
  activeCount: number;
  deferredCount: number;
  failedCount: number;
  oldestQueuedAgeSec: number | null;
  lastCompletedAt: string | null;
};

export type ScheduleHealth = {
  name: string;
  cron: string | null;
  timezone: string | null;
};

export type IntegrationStaleness = {
  organizationId: string;
  provider: string;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
  stale: boolean;
};

export type InternalHealthReport = {
  ok: boolean;
  checkedAt: string;
  scale: {
    cacheBackend: "memory" | "valkey";
    readReplica: boolean;
  };
  queues: QueueHealth[];
  schedules: ScheduleHealth[];
  stuckRuns: {
    count: number;
  };
  integrations: {
    connected: number;
    stale: number;
    staleRows: IntegrationStaleness[];
  };
};

async function loadLastCompletedByQueue(
  queueNames: string[],
): Promise<Map<string, Date>> {
  if (queueNames.length === 0) return new Map();

  try {
    const db = asSystem();
    const rows = await db.$queryRawUnsafe<
      Array<{ name: string; last_completed: Date | null }>
    >(
      `SELECT name, MAX(completed_on) AS last_completed
       FROM pgboss.job
       WHERE state = 'completed' AND name = ANY($1::text[])
       GROUP BY name`,
      queueNames,
    );

    const map = new Map<string, Date>();
    for (const row of rows) {
      if (row.last_completed) map.set(row.name, row.last_completed);
    }
    return map;
  } catch (err) {
    log.warn({ err }, "failed to read last completed job timestamps");
    return new Map();
  }
}

async function oldestQueuedAgeSec(queueName: string): Promise<number | null> {
  try {
    const boss = await getBoss();
    const jobs = await boss.findJobs(queueName, { queued: true });
    if (!jobs.length) return null;
    const oldest = jobs.reduce((min, job) => {
      const created = job.createdOn instanceof Date ? job.createdOn : new Date(job.createdOn);
      return created < min ? created : min;
    }, new Date());
    return Math.max(0, Math.floor((Date.now() - oldest.getTime()) / 1000));
  } catch (err) {
    log.warn({ err, queueName }, "failed to read oldest queued job");
    return null;
  }
}

/** Agent wakeup runs were removed in the simple chat refactor; always report zero. */
export async function countStuckRuns(): Promise<number> {
  return 0;
}

export async function getInternalHealth(): Promise<InternalHealthReport> {
  const boss = await getBoss();
  const knownNames = new Set<string>(Object.values(JOB_NAMES));

  // Include org-scoped child queues (e.g. compliance.eval.org)
  for (const name of Object.values(JOB_NAMES)) {
    if (name.endsWith(".org")) continue;
    knownNames.add(`${name}.org`);
  }

  const allQueues = await boss.getQueues();
  const queuesOfInterest = allQueues.filter(
    (q) => knownNames.has(q.name) || q.queuedCount > 0 || q.activeCount > 0 || q.failedCount > 0,
  );

  const lastCompleted = await loadLastCompletedByQueue(
    queuesOfInterest.map((q) => q.name),
  );

  const queues: QueueHealth[] = await Promise.all(
    queuesOfInterest.map(async (q) => ({
      name: q.name,
      queuedCount: q.queuedCount,
      readyCount: q.readyCount,
      activeCount: q.activeCount,
      deferredCount: q.deferredCount,
      failedCount: q.failedCount,
      oldestQueuedAgeSec: q.readyCount > 0 ? await oldestQueuedAgeSec(q.name) : null,
      lastCompletedAt: lastCompleted.get(q.name)?.toISOString() ?? null,
    })),
  );

  queues.sort((a, b) => a.name.localeCompare(b.name));

  const schedules = (await boss.getSchedules()).map((s) => ({
    name: s.name,
    cron: s.cron ?? null,
    timezone: s.timezone ?? null,
  }));

  const stuckCount = await countStuckRuns();

  const integrations = await asSystem().integration.findMany({
    where: { status: "CONNECTED" },
    select: {
      organizationId: true,
      provider: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
    },
    orderBy: [{ organizationId: "asc" }, { provider: "asc" }],
  });

  const now = Date.now();
  const staleRows: IntegrationStaleness[] = integrations
    .map((row) => {
      const stale =
        !row.lastSyncAt || now - row.lastSyncAt.getTime() > STALE_SYNC_MS;
      return {
        organizationId: row.organizationId,
        provider: row.provider,
        status: row.status,
        lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
        lastError: row.lastError,
        stale,
      };
    })
    .filter((row) => row.stale);

  const ok =
    stuckCount === 0 &&
    queues.every((q) => q.failedCount === 0) &&
    staleRows.length === 0;

  return {
    ok,
    checkedAt: new Date().toISOString(),
    scale: {
      cacheBackend: getCacheBackend(),
      readReplica: isReadReplicaConfigured(),
    },
    queues,
    schedules,
    stuckRuns: { count: stuckCount },
    integrations: {
      connected: integrations.length,
      stale: staleRows.length,
      staleRows,
    },
  };
}
