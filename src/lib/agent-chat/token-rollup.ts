import { prisma } from "@/lib/prisma";
import { readJsonField } from "@/lib/json-field";

export type ThreadTokenRollup = {
  runCount: number;
  succeededRuns: number;
  inputTokens: number;
  outputTokens: number;
};

function parseTokenUsage(json: unknown): {
  inputTokens?: number;
  outputTokens?: number;
  mode?: string;
} {
  return readJsonField(json, {});
}

function extractThreadIdFromSnapshot(json: unknown): string | null {
  const parsed = readJsonField<{ threadId?: unknown }>(json, {});
  return typeof parsed.threadId === "string" ? parsed.threadId : null;
}

/** Sum LLM token usage across all heartbeat runs tied to an agent chat thread. */
export async function rollupThreadTokenUsage(
  organizationId: string,
  threadId: string,
): Promise<ThreadTokenRollup> {
  const [candidateRuns, messageRunIds] = await Promise.all([
    prisma.agentHeartbeatRun.findMany({
      where: {
        organizationId,
        contextSnapshotJson: {
          string_contains: `"threadId":"${threadId}"`,
        },
      },
      select: {
        id: true,
        status: true,
        tokenUsageJson: true,
        contextSnapshotJson: true,
      },
    }),
    prisma.agentChatMessage.findMany({
      where: { organizationId, threadId, runId: { not: null } },
      select: { runId: true },
      distinct: ["runId"],
    }),
  ]);

  const matchedRunIds = new Set<string>();
  const runs: Array<{ status: string; tokenUsageJson: unknown }> = [];

  for (const run of candidateRuns) {
    if (extractThreadIdFromSnapshot(run.contextSnapshotJson) === threadId) {
      matchedRunIds.add(run.id);
      runs.push(run);
    }
  }

  const extraRunIds = messageRunIds
    .map((row) => row.runId)
    .filter((id): id is string => typeof id === "string" && !matchedRunIds.has(id));

  if (extraRunIds.length > 0) {
    const extraRuns = await prisma.agentHeartbeatRun.findMany({
      where: { organizationId, id: { in: extraRunIds } },
      select: { status: true, tokenUsageJson: true },
    });
    runs.push(...extraRuns);
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let succeededRuns = 0;

  for (const run of runs) {
    if (run.status === "succeeded") succeededRuns++;
    const usage = parseTokenUsage(run.tokenUsageJson);
    if (usage.mode === "anthropic" || usage.mode === "openai" || usage.mode === "mastra") {
      inputTokens += usage.inputTokens ?? 0;
      outputTokens += usage.outputTokens ?? 0;
    }
  }

  return {
    runCount: runs.length,
    succeededRuns,
    inputTokens,
    outputTokens,
  };
}
