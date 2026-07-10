import type { PgBoss } from "pg-boss";

import type { AgentWakeupSource } from "@/generated/prisma/client";
import { WAKEUP_SOURCE_PRIORITY } from "@/lib/agent-control-plane/types";
import { createLogger } from "@/lib/logger";
import { getBoss, isPgBossEnabled } from "./boss";
import { JOB_NAMES } from "./constants";

const log = createLogger({ component: "jobs/agent-wakeup" });

export type AgentWakeupJobData = {
  wakeupId: string;
  organizationId?: string;
  source?: AgentWakeupSource;
};

function pgBossPriority(source?: AgentWakeupSource): number {
  if (!source) return 50;
  // pg-boss: higher number = higher priority; our map uses lower = higher.
  return 100 - WAKEUP_SOURCE_PRIORITY[source] * 10;
}

/** Enqueue a durable agent wakeup job (idempotent per wakeup row). */
export async function sendAgentWakeupJob(
  input: AgentWakeupJobData,
): Promise<void> {
  if (!isPgBossEnabled()) return;

  const boss = await getBoss();
  const jobId = await boss.send(
    JOB_NAMES.agentWakeup,
    {
      wakeupId: input.wakeupId,
      organizationId: input.organizationId,
      source: input.source,
    },
    {
      singletonKey: `wakeup:${input.wakeupId}`,
      priority: pgBossPriority(input.source),
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true,
    },
  );

  log.debug(
    { wakeupId: input.wakeupId, jobId, source: input.source },
    "agent wakeup job enqueued",
  );
}

export async function registerAgentWakeupWorker(boss: PgBoss): Promise<void> {
  const concurrency = Math.max(
    1,
    Math.min(20, Number(process.env.AGENT_WORKER_CONCURRENCY ?? "5") || 5),
  );

  await boss.createQueue(JOB_NAMES.agentWakeup, {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
  });

  await boss.work<AgentWakeupJobData>(
    JOB_NAMES.agentWakeup,
    { localConcurrency: concurrency },
    async (jobs) => {
      const { processWakeupById } = await import(
        "@/lib/agent-control-plane/worker"
      );
      for (const job of jobs) {
        await processWakeupById(job.data.wakeupId);
      }
    },
  );

  log.info({ concurrency }, "registered agent.wakeup worker");
}

export async function registerAgentTimerScanWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(JOB_NAMES.agentTimerScan, {
    retryLimit: 2,
    retryDelay: 10,
  });

  await boss.work(JOB_NAMES.agentTimerScan, async () => {
    const { enqueueTimerWakeups } = await import(
      "@/lib/agent-control-plane/worker"
    );
    const { recoverStuckRuns } = await import(
      "@/lib/agent-control-plane/worker"
    );

    await recoverStuckRuns();
    const enqueued = await enqueueTimerWakeups();
    log.debug({ enqueued }, "agent timer scan complete");
  });

  const cron = "*/1 * * * *";

  await boss.schedule(JOB_NAMES.agentTimerScan, cron, {}, { key: "default" });
  log.info({ cron }, "scheduled agent.timer-scan");
}
