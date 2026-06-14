import { prisma } from "@/lib/prisma";

export type AgentTokenRollup = {
  runCount: number;
  succeededRuns: number;
  inputTokens: number;
  outputTokens: number;
  periodDays: number;
};

function parseTokenUsage(json: string): {
  inputTokens?: number;
  outputTokens?: number;
  mode?: string;
} {
  try {
    return JSON.parse(json) as {
      inputTokens?: number;
      outputTokens?: number;
      mode?: string;
    };
  } catch {
    return {};
  }
}

/** Aggregate LLM token usage for an org over a rolling window. */
export async function rollupAgentTokens(
  organizationId: string,
  periodDays = 30,
): Promise<AgentTokenRollup> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const runs = await prisma.agentHeartbeatRun.findMany({
    where: {
      organizationId,
      startedAt: { gte: since },
    },
    select: {
      status: true,
      tokenUsageJson: true,
    },
  });

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
    periodDays,
  };
}

export function formatTokenRollup(rollup: AgentTokenRollup): string {
  if (rollup.inputTokens === 0 && rollup.outputTokens === 0) {
    return rollup.runCount > 0 ? `${rollup.runCount} runs` : "—";
  }
  const total = rollup.inputTokens + rollup.outputTokens;
  if (total >= 1_000_000) {
    return `${(total / 1_000_000).toFixed(1)}M tok`;
  }
  if (total >= 1_000) {
    return `${(total / 1_000).toFixed(1)}k tok`;
  }
  return `${total} tok`;
}
