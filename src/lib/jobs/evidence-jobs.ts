import type { PgBoss } from "pg-boss";

import { asSystem } from "@/lib/prisma";
import { recomputeEvidenceForOrg } from "@/lib/evidence/recompute";
import { createLogger } from "@/lib/logger";
import { JOB_NAMES } from "./constants";
import { createOrgFanoutJobs } from "./org-fanout";
import { getBoss } from "./boss";

const log = createLogger({ component: "jobs/evidence" });

async function listOrgsWithEvidenceSnapshots(): Promise<string[]> {
  const rows = await asSystem().ticketSnapshot.findMany({
    distinct: ["organizationId"],
    select: { organizationId: true },
    orderBy: { organizationId: "asc" },
  });
  return rows.map((r) => r.organizationId);
}

export const evidenceRecomputeFanout = createOrgFanoutJobs({
  fanoutName: JOB_NAMES.evidenceRecompute,
  orgJobName: `${JOB_NAMES.evidenceRecompute}.org`,
  cron: "0 3 * * *",
  cronEnvKey: "EVIDENCE_RECOMPUTE_INTERVAL_SEC",
  singletonPrefix: "evidence-recompute",
  listOrganizationIds: listOrgsWithEvidenceSnapshots,
  runForOrganization: async (organizationId) => {
    const result = await recomputeEvidenceForOrg(organizationId);
    log.info({ organizationId, ...result }, "evidence.recompute.org complete");
  },
  retryLimit: 2,
  retryDelay: 120,
});

export async function ensureEvidenceSchedule(boss: PgBoss): Promise<void> {
  await evidenceRecomputeFanout.ensureSchedule(boss);
}

export async function registerEvidenceWorkers(boss: PgBoss): Promise<void> {
  await evidenceRecomputeFanout.registerWorker(boss);
}

export async function enqueueEvidenceRecompute(
  organizationId: string,
): Promise<string | null> {
  return evidenceRecomputeFanout.sendOrgJob(organizationId);
}

/** Ensure queues exist so web can enqueue on-demand without registering workers. */
export async function ensureEvidenceQueues(): Promise<void> {
  const boss = await getBoss();
  await evidenceRecomputeFanout.ensureSchedule(boss);
}
