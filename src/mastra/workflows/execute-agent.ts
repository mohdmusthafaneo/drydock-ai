import type { AgentType } from "@/generated/prisma/client";
import type { Mastra } from "@mastra/core/mastra";
import type { RequestContext } from "@mastra/core/request-context";
import type { ChunkType } from "@mastra/core/stream";

import type { ChatStreamSession } from "@/lib/agent-chat/stream";
import { bridgeMastraStreamToChatSession } from "@/lib/agent-chat/mastra-stream-bridge";
import type { AgentPermissions } from "@/lib/agent-control-plane/types";
import { getMastraAgentIdForType } from "../agents";
import { getAidosToolsForAgent } from "../agents/toolsets";

import type { AidosRequestContextValues } from "../tools/aidos/context";

export type AidosAgentRunInput = {
  mastra: Mastra;
  agentType: AgentType;
  systemPrompt: string;
  userMessage: string;
  requestContext: RequestContext<any>;
  permissions?: AgentPermissions;
  streamSession?: ChatStreamSession | null;
  maxSteps?: number;
};

export type AidosAgentRunResult = {
  summary: string;
  inputTokens: number;
  outputTokens: number;
  mastraRunId?: string;
  mastraTraceId?: string;
};

function usageTotals(usage: {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
} | null | undefined): { inputTokens: number; outputTokens: number } {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  const inputTokens = usage.inputTokens ?? usage.promptTokens ?? 0;
  const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0;
  return { inputTokens, outputTokens };
}

/** Run a Mastra agent with optional chat streaming and tool context from requestContext. */
export async function executeAidosAgentRun(
  input: AidosAgentRunInput,
): Promise<AidosAgentRunResult> {
  const mastraAgentId = getMastraAgentIdForType(input.agentType);
  const agent = input.mastra.getAgent(mastraAgentId);
  if (!agent) {
    throw new Error(`Mastra agent not found: ${mastraAgentId}`);
  }

  const permissions =
    input.permissions ?? ({ canCreateAgents: false } satisfies AgentPermissions);
  const toolsets = {
    aidos: getAidosToolsForAgent(input.agentType, permissions),
  };

  const typedRequestContext =
    input.requestContext as RequestContext<AidosRequestContextValues>;

  const executionOptions = {
    instructions: input.systemPrompt,
    requestContext: typedRequestContext,
    toolsets,
    maxSteps: input.maxSteps ?? 15,
  };

  if (input.streamSession) {
    const streamOutput = await agent.stream(
      [{ role: "user" as const, content: input.userMessage }],
      executionOptions,
    );

    await bridgeMastraStreamToChatSession(
      streamOutput.fullStream as ReadableStream<ChunkType<unknown>>,
      input.streamSession,
    );

    const full = await streamOutput.getFullOutput();
    const tokens = usageTotals(full.totalUsage ?? full.usage);

    return {
      summary: (full.text || "").slice(0, 8000),
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      mastraRunId: full.runId ?? streamOutput.runId,
      mastraTraceId: full.traceId ?? streamOutput.traceId,
    };
  }

  const output = await agent.generate(
    [{ role: "user" as const, content: input.userMessage }],
    executionOptions,
  );

  const tokens = usageTotals(output.totalUsage ?? output.usage);

  return {
    summary: (output.text || "").slice(0, 8000),
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    mastraRunId: output.runId,
    mastraTraceId: output.traceId,
  };
}
