import type { PgBoss } from "pg-boss";

import { createLogger } from "@/lib/logger";
import { getEmbeddingService } from "@/lib/ml/embedding-service";
import {
  DEFAULT_EMBEDDING_MODEL,
  upsertEmbedding,
} from "@/lib/ml/vector-store";
import { JOB_NAMES } from "./constants";
import { getBoss } from "./boss";

const log = createLogger({ component: "jobs/ml" });

export type MlEmbedJobData = {
  organizationId: string;
  refType: "commit" | "ticket";
  refId: string;
  text: string;
  modelName?: string;
};

export type MlCodeQualityJobData = {
  organizationId: string;
  commitSnapshotId?: string;
  sha?: string;
  diff: string;
};

async function ensureMlQueues(boss: PgBoss): Promise<void> {
  for (const name of [JOB_NAMES.mlEmbed, JOB_NAMES.mlCodeQuality]) {
    const dlq = `${name}.dlq`;
    await boss.createQueue(dlq);
    await boss.createQueue(name, {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      deadLetter: dlq,
    });
  }
}

async function handleEmbed(data: MlEmbedJobData): Promise<void> {
  const svc = getEmbeddingService();
  const result = await svc.embed([data.text]);
  const vector = result.vectors[0];
  if (!vector) throw new Error("embed returned empty vectors");

  await upsertEmbedding({
    organizationId: data.organizationId,
    refType: data.refType,
    refId: data.refId,
    modelName: data.modelName ?? result.model ?? DEFAULT_EMBEDDING_MODEL,
    vector,
  });

  log.info(
    {
      organizationId: data.organizationId,
      refType: data.refType,
      refId: data.refId,
      dim: result.dim,
    },
    "ml.embed complete",
  );
}

async function handleCodeQuality(data: MlCodeQualityJobData): Promise<void> {
  const svc = getEmbeddingService();
  const result = await svc.score(data.diff);
  log.info(
    {
      organizationId: data.organizationId,
      commitSnapshotId: data.commitSnapshotId,
      sha: data.sha,
      score: result.score,
      rationale: result.rationale,
    },
    "ml.codeQuality complete",
  );
}

export async function registerMlWorkers(boss: PgBoss): Promise<void> {
  await ensureMlQueues(boss);

  await boss.work<MlEmbedJobData>(JOB_NAMES.mlEmbed, async (jobs) => {
    for (const job of jobs) {
      await handleEmbed(job.data);
    }
  });

  await boss.work<MlCodeQualityJobData>(JOB_NAMES.mlCodeQuality, async (jobs) => {
    for (const job of jobs) {
      await handleCodeQuality(job.data);
    }
  });

  log.info("ml workers registered");
}

export async function enqueueMlEmbed(
  data: MlEmbedJobData,
): Promise<string | null> {
  const boss = await getBoss();
  await ensureMlQueues(boss);
  return boss.send(JOB_NAMES.mlEmbed, data, {
    singletonKey: `ml-embed:${data.organizationId}:${data.refType}:${data.refId}`,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });
}

export async function enqueueMlCodeQuality(
  data: MlCodeQualityJobData,
): Promise<string | null> {
  const boss = await getBoss();
  await ensureMlQueues(boss);
  return boss.send(JOB_NAMES.mlCodeQuality, data, {
    singletonKey: data.commitSnapshotId
      ? `ml-cq:${data.organizationId}:${data.commitSnapshotId}`
      : undefined,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });
}
