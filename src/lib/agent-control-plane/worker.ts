import { prisma } from "@/lib/prisma";
import type { AgentWakeupSource } from "@/generated/prisma/client";
import { runLlmAdapter } from "./adapters/llm";
import {
  createEphemeralRunApiKey,
  revokeEphemeralRunApiKey,
} from "./api-keys";
import { logAgentActivity, logAgentAudit } from "./audit";
import {
  compareWakeupPriority,
  enqueueWakeup,
  isAgentRunnable,
} from "./wakeup";
import { resolveRuntimeConfig } from "./runtime-config";

export type WorkerRunResult = {
  timersEnqueued: number;
  wakeupsProcessed: number;
  runsSucceeded: number;
  runsFailed: number;
  errors: string[];
};

function timerBucket(agentId: string, intervalSec: number, now: Date): string {
  const bucket = Math.floor(now.getTime() / 1000 / intervalSec);
  return `timer:${agentId}:${bucket}`;
}

/** Find agents with timer heartbeat due and enqueue wakeups. */
export async function enqueueTimerWakeups(
  organizationId?: string,
): Promise<number> {
  if (process.env.AGENT_WORKER_ENABLED === "false") return 0;

  const now = new Date();
  const agents = await prisma.agentRegistry.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      status: { notIn: ["PAUSED", "PENDING_APPROVAL", "TERMINATED", "ERROR"] },
    },
  });

  let enqueued = 0;

  for (const agent of agents) {
    const config = resolveRuntimeConfig(agent);
    const { heartbeat } = config;

    if (!heartbeat.enabled || heartbeat.intervalSec <= 0) continue;

    const last = agent.lastHeartbeatAt ?? agent.createdAt;
    const elapsedSec = (now.getTime() - last.getTime()) / 1000;
    if (elapsedSec < heartbeat.intervalSec) continue;

    const result = await enqueueWakeup({
      organizationId: agent.organizationId,
      agentId: agent.id,
      source: "timer",
      reason: "heartbeat.timer",
      idempotencyKey: timerBucket(agent.id, heartbeat.intervalSec, now),
    });

    if (result.ok && !result.coalesced) enqueued++;
  }

  return enqueued;
}

async function executeHeartbeatRun(wakeupId: string): Promise<boolean> {
  const wakeup = await prisma.agentWakeupRequest.findUnique({
    where: { id: wakeupId },
    include: { agent: true },
  });

  if (!wakeup || wakeup.status !== "queued") return false;

  const { agent, organizationId } = wakeup;

  if (!isAgentRunnable(agent.status)) {
    await prisma.agentWakeupRequest.update({
      where: { id: wakeupId },
      data: {
        status: "skipped",
        finishedAt: new Date(),
        error: `Agent status ${agent.status}`,
      },
    });
    return false;
  }

  const startedAt = new Date();

  const run = await prisma.$transaction(async (tx) => {
    await tx.agentWakeupRequest.update({
      where: { id: wakeupId },
      data: { status: "running", startedAt },
    });

    await tx.agentRegistry.update({
      where: { id: agent.id },
      data: { status: "RUNNING" },
    });

    return tx.agentHeartbeatRun.create({
      data: {
        organizationId,
        agentId: agent.id,
        wakeupRequestId: wakeupId,
        status: "running",
        source: wakeup.source,
        reason: wakeup.reason,
        contextSnapshotJson: wakeup.payloadJson,
        startedAt,
      },
    });
  });

  let adapterResult;
  let ephemeralKey: string | null = null;
  try {
    if (agent.adapterType === "llm") {
      ephemeralKey = await createEphemeralRunApiKey(
        organizationId,
        agent.id,
        run.id,
      );
      adapterResult = await runLlmAdapter({
        runId: run.id,
        agent,
        wakeup: {
          id: wakeup.id,
          source: wakeup.source as AgentWakeupSource,
          reason: wakeup.reason,
          payloadJson: wakeup.payloadJson,
        },
        organizationId,
        agentApiKey: ephemeralKey,
      });
    } else {
      const { runInternalAdapter } = await import("./adapters/internal");
      adapterResult = await runInternalAdapter({
        runId: run.id,
        agent,
        wakeup: {
          id: wakeup.id,
          source: wakeup.source as AgentWakeupSource,
          reason: wakeup.reason,
          payloadJson: wakeup.payloadJson,
        },
        organizationId,
      });
    }
  } catch (err) {
    adapterResult = {
      status: "failed" as const,
      error: err instanceof Error ? err.message : "Adapter execution failed",
    };
  } finally {
    if (ephemeralKey) {
      await revokeEphemeralRunApiKey(run.id).catch(() => undefined);
    }
  }

  const finishedAt = new Date();
  const runStatus =
    adapterResult.status === "succeeded"
      ? "succeeded"
      : adapterResult.status === "timed_out"
        ? "timed_out"
        : "failed";

  await prisma.$transaction(async (tx) => {
    await tx.agentHeartbeatRun.update({
      where: { id: run.id },
      data: {
        status: runStatus,
        finishedAt,
        summary: adapterResult.summary,
        error: adapterResult.error,
        tokenUsageJson: JSON.stringify(adapterResult.tokenUsage ?? {}),
        logsJson: JSON.stringify([
          {
            at: finishedAt.toISOString(),
            level: runStatus === "succeeded" ? "info" : "error",
            message: adapterResult.summary ?? adapterResult.error,
          },
        ]),
        exitCode: runStatus === "succeeded" ? 0 : 1,
      },
    });

    await tx.agentWakeupRequest.update({
      where: { id: wakeupId },
      data: {
        status: "completed",
        finishedAt,
        error: adapterResult.error,
      },
    });

    await tx.agentRegistry.update({
      where: { id: agent.id },
      data: {
        status: "IDLE",
        lastHeartbeatAt: finishedAt,
        lastActiveAt: finishedAt,
      },
    });

    await logAgentActivity(tx, {
      organizationId,
      type: "agent.heartbeat.completed",
      title: `${agent.displayName} heartbeat ${runStatus}`,
      description: adapterResult.summary ?? adapterResult.error,
      metadata: { agentId: agent.id, runId: run.id, source: wakeup.source },
    });

    await logAgentAudit(tx, {
      organizationId,
      action: `agent.heartbeat.${runStatus}`,
      entityType: "AgentHeartbeatRun",
      entityId: run.id,
      agentId: agent.id,
      metadata: { source: wakeup.source, reason: wakeup.reason },
    });
  });

  return runStatus === "succeeded";
}

/** Recover heartbeat runs stuck beyond maxRunDurationSec. */
export async function recoverStuckRuns(
  organizationId?: string,
): Promise<number> {
  const now = new Date();
  const runningWakeups = await prisma.agentWakeupRequest.findMany({
    where: {
      status: "running",
      ...(organizationId ? { organizationId } : {}),
    },
    include: { agent: true },
  });

  let recovered = 0;

  for (const wakeup of runningWakeups) {
    const config = resolveRuntimeConfig(wakeup.agent);
    const maxSec = config.heartbeat.maxRunDurationSec || 300;
    const startedAt = wakeup.startedAt ?? wakeup.requestedAt;
    const elapsedSec = (now.getTime() - startedAt.getTime()) / 1000;
    if (elapsedSec < maxSec) continue;

    await prisma.$transaction(async (tx) => {
      const run = await tx.agentHeartbeatRun.findFirst({
        where: { wakeupRequestId: wakeup.id, status: "running" },
      });

      if (run) {
        await tx.agentHeartbeatRun.update({
          where: { id: run.id },
          data: {
            status: "timed_out",
            finishedAt: now,
            error: `Run exceeded max duration (${maxSec}s)`,
            exitCode: 124,
          },
        });
      }

      await tx.agentWakeupRequest.update({
        where: { id: wakeup.id },
        data: {
          status: "completed",
          finishedAt: now,
          error: `Timed out after ${Math.round(elapsedSec)}s`,
        },
      });

      if (isAgentRunnable(wakeup.agent.status) || wakeup.agent.status === "RUNNING") {
        await tx.agentRegistry.update({
          where: { id: wakeup.agentId },
          data: { status: "IDLE" },
        });
      }

      await logAgentActivity(tx, {
        organizationId: wakeup.organizationId,
        type: "agent.heartbeat.timed_out",
        title: `${wakeup.agent.displayName} heartbeat timed out`,
        description: `Recovered stuck run after ${Math.round(elapsedSec)}s`,
        metadata: { agentId: wakeup.agentId, wakeupId: wakeup.id, runId: run?.id },
      });
    });

    recovered++;
  }

  return recovered;
}

/** Claim and process pending wakeups (FIFO + priority). */
export async function drainWakeupQueue(
  organizationId?: string,
  limit = 10,
): Promise<WorkerRunResult> {
  const result: WorkerRunResult = {
    timersEnqueued: 0,
    wakeupsProcessed: 0,
    runsSucceeded: 0,
    runsFailed: 0,
    errors: [],
  };

  if (process.env.AGENT_WORKER_ENABLED === "false") {
    return result;
  }

  await recoverStuckRuns(organizationId);

  result.timersEnqueued = await enqueueTimerWakeups(organizationId);

  const pending = await prisma.agentWakeupRequest.findMany({
    where: {
      status: "queued",
      ...(organizationId ? { organizationId } : {}),
    },
    orderBy: { requestedAt: "asc" },
    take: limit * 3,
    include: { agent: true },
  });

  pending.sort(compareWakeupPriority);

  const toProcess = pending.slice(0, limit);

  for (const wakeup of toProcess) {
    try {
      const ok = await executeHeartbeatRun(wakeup.id);
      result.wakeupsProcessed++;
      if (ok) result.runsSucceeded++;
      else result.runsFailed++;
    } catch (err) {
      result.errors.push(
        err instanceof Error ? err.message : `Failed wakeup ${wakeup.id}`,
      );
      result.runsFailed++;
    }
  }

  return result;
}
