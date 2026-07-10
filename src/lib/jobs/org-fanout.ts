import type { PgBoss } from "pg-boss";

import { createLogger } from "@/lib/logger";
import { getBoss } from "./boss";
import { resolveCronExpression } from "./job-queue";

const log = createLogger({ component: "jobs/org-fanout" });

export type OrgFanoutJobConfig = {
  fanoutName: string;
  orgJobName: string;
  cron: string;
  cronEnvKey?: string;
  singletonPrefix: string;
  listOrganizationIds: () => Promise<string[]>;
  runForOrganization: (organizationId: string) => Promise<void>;
  retryLimit?: number;
  retryDelay?: number;
  orgConcurrency?: number;
};

async function ensureOrgJobQueue(
  boss: PgBoss,
  name: string,
  options: { retryLimit: number; retryDelay: number },
): Promise<void> {
  const dlqName = `${name}.dlq`;
  await boss.createQueue(dlqName);
  await boss.createQueue(name, {
    retryLimit: options.retryLimit,
    retryDelay: options.retryDelay,
    retryBackoff: true,
    deadLetter: dlqName,
  });
}

/**
 * Scheduled fan-out → per-org child jobs with singleton keys, retries, and DLQ.
 * Replaces sequential "loop all orgs in one job" handlers (architecture G4).
 */
export function createOrgFanoutJobs(config: OrgFanoutJobConfig) {
  const retryLimit = config.retryLimit ?? 3;
  const retryDelay = config.retryDelay ?? 60;
  const orgConcurrency = config.orgConcurrency ?? 3;

  async function ensureFanoutQueue(boss: PgBoss): Promise<void> {
    const dlqName = `${config.fanoutName}.dlq`;
    await boss.createQueue(dlqName);
    await boss.createQueue(config.fanoutName, {
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
      deadLetter: dlqName,
    });
  }

  async function fanoutHandler(): Promise<void> {
    const boss = await getBoss();
    const organizationIds = await config.listOrganizationIds();

    let enqueued = 0;
    for (const organizationId of organizationIds) {
      const jobId = await boss.send(
        config.orgJobName,
        { organizationId },
        {
          singletonKey: `${config.singletonPrefix}:${organizationId}`,
          retryLimit,
          retryDelay,
          retryBackoff: true,
        },
      );
      if (jobId) enqueued += 1;
    }

    log.info(
      { fanout: config.fanoutName, targets: organizationIds.length, enqueued },
      "org fanout complete",
    );
  }

  async function ensureSchedule(boss: PgBoss): Promise<void> {
    await ensureFanoutQueue(boss);
    await ensureOrgJobQueue(boss, config.orgJobName, { retryLimit, retryDelay });

    const cron = resolveCronExpression(config.cronEnvKey, config.cron);
    await boss.schedule(config.fanoutName, cron, {}, { key: "default" });
    log.info({ fanout: config.fanoutName, cron }, "fanout schedule ensured");
  }

  async function registerWorker(boss: PgBoss): Promise<void> {
    await ensureFanoutQueue(boss);
    await ensureOrgJobQueue(boss, config.orgJobName, { retryLimit, retryDelay });

    await boss.work(config.fanoutName, async () => {
      await fanoutHandler();
    });

    await boss.work<{ organizationId: string }>(
      config.orgJobName,
      { localConcurrency: orgConcurrency },
      async (jobs) => {
        for (const job of jobs) {
          await config.runForOrganization(job.data.organizationId);
        }
      },
    );

    log.info(
      { fanout: config.fanoutName, orgJob: config.orgJobName, orgConcurrency },
      "org fanout workers registered",
    );
  }

  async function sendOrgJob(organizationId: string): Promise<string | null> {
    const boss = await getBoss();
    return boss.send(
      config.orgJobName,
      { organizationId },
      {
        singletonKey: `${config.singletonPrefix}:${organizationId}`,
        retryLimit,
        retryDelay,
        retryBackoff: true,
      },
    );
  }

  /** On-demand fanout trigger (e.g. from HTTP cron route). */
  async function sendFanoutJob(): Promise<string | null> {
    const boss = await getBoss();
    return boss.send(config.fanoutName, {}, {
      singletonKey: `${config.singletonPrefix}:fanout`,
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
    });
  }

  return {
    fanoutName: config.fanoutName,
    orgJobName: config.orgJobName,
    ensureSchedule,
    registerWorker,
    sendOrgJob,
    sendFanoutJob,
  };
}

/** Fan-out where each target is (organizationId + extra fields), not just orgId. */
export type TargetFanoutJobConfig<T extends { organizationId: string }> = {
  fanoutName: string;
  targetJobName: string;
  cron: string;
  cronEnvKey?: string;
  singletonKey: (target: T) => string;
  listTargets: () => Promise<T[]>;
  runForTarget: (target: T) => Promise<void>;
  retryLimit?: number;
  targetConcurrency?: number;
};

export function createTargetFanoutJobs<T extends { organizationId: string }>(
  config: TargetFanoutJobConfig<T>,
) {
  const retryLimit = config.retryLimit ?? 3;
  const retryDelay = 60;
  const targetConcurrency = config.targetConcurrency ?? 5;

  async function ensureFanoutQueue(boss: PgBoss): Promise<void> {
    const dlqName = `${config.fanoutName}.dlq`;
    await boss.createQueue(dlqName);
    await boss.createQueue(config.fanoutName, {
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
      deadLetter: dlqName,
    });
  }

  async function fanoutHandler(): Promise<void> {
    const boss = await getBoss();
    const targets = await config.listTargets();

    let enqueued = 0;
    for (const target of targets) {
      const jobId = await boss.send(config.targetJobName, target, {
        singletonKey: config.singletonKey(target),
        retryLimit,
        retryDelay,
        retryBackoff: true,
      });
      if (jobId) enqueued += 1;
    }

    log.info(
      { fanout: config.fanoutName, targets: targets.length, enqueued },
      "target fanout complete",
    );
  }

  async function ensureSchedule(boss: PgBoss): Promise<void> {
    await ensureFanoutQueue(boss);
    await ensureOrgJobQueue(boss, config.targetJobName, { retryLimit, retryDelay });

    const cron = resolveCronExpression(config.cronEnvKey, config.cron);
    await boss.schedule(config.fanoutName, cron, {}, { key: "default" });
    log.info({ fanout: config.fanoutName, cron }, "target fanout schedule ensured");
  }

  async function registerWorker(boss: PgBoss): Promise<void> {
    await ensureFanoutQueue(boss);
    await ensureOrgJobQueue(boss, config.targetJobName, { retryLimit, retryDelay });

    await boss.work(config.fanoutName, async () => {
      await fanoutHandler();
    });

    await boss.work<T>(
      config.targetJobName,
      { localConcurrency: targetConcurrency },
      async (jobs) => {
        for (const job of jobs) {
          await config.runForTarget(job.data);
        }
      },
    );

    log.info(
      {
        fanout: config.fanoutName,
        targetJob: config.targetJobName,
        targetConcurrency,
      },
      "target fanout workers registered",
    );
  }

  async function sendTargetJob(target: T): Promise<string | null> {
    const boss = await getBoss();
    return boss.send(config.targetJobName, target, {
      singletonKey: config.singletonKey(target),
      retryLimit,
      retryDelay,
      retryBackoff: true,
    });
  }

  async function sendFanoutJob(): Promise<string | null> {
    const boss = await getBoss();
    return boss.send(config.fanoutName, {}, {
      singletonKey: `${config.fanoutName}:fanout`,
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
    });
  }

  return {
    fanoutName: config.fanoutName,
    targetJobName: config.targetJobName,
    ensureSchedule,
    registerWorker,
    sendTargetJob,
    sendFanoutJob,
  };
}
