import { getMastra } from "@/mastra";
import { loadAgentInstructionContext } from "@/mastra/context/instructions";
import {
  createAidosRequestContext,
  createAidosToolContext,
} from "@/mastra/tools/aidos";
import { executeAidosAgentRun } from "@/mastra/workflows/execute-agent";
import {
  augmentUserMessageForRouting,
  isChatStreamingRun,
  isChatWakeup,
  renderWakeUserMessage,
  resolveChatRoutingMode,
} from "@/mastra/workflows/wake-message";
import { createChatStreamSession } from "@/lib/agent-chat/stream";
import { parsePermissions } from "../agent-auth";
import { assertAnthropicConfigured, resolveAnthropicConfig } from "../llm/config";
import type { AdapterExecutionContext, AdapterExecutionResult } from "../types";

function parsePayload(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type WorkflowRunOutput = {
  summary: string;
  inputTokens: number;
  outputTokens: number;
  mastraRunId?: string;
  mastraTraceId?: string;
};

export async function runMastraAdapter(
  ctx: AdapterExecutionContext & { agentApiKey: string },
): Promise<AdapterExecutionResult> {
  const anthropicConfig = resolveAnthropicConfig(ctx.agent.adapterConfigJson);

  try {
    assertAnthropicConfigured(anthropicConfig);
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "LLM not configured",
      tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "mastra" },
    };
  }

  const wakePayload = parsePayload(ctx.wakeup.payloadJson);
  const permissions = parsePermissions(ctx.agent.permissionsJson);
  const { systemPrompt } = await loadAgentInstructionContext(ctx.organizationId, {
    id: ctx.agent.id,
    agentType: ctx.agent.agentType,
    role: ctx.agent.role,
    adapterConfigJson: ctx.agent.adapterConfigJson,
    permissionsJson: ctx.agent.permissionsJson,
  });

  const toolContext = createAidosToolContext({
    agentApiKey: ctx.agentApiKey,
    runId: ctx.runId,
    wakePayload,
  });
  const requestContext = createAidosRequestContext(toolContext);

  const chatThreadId = isChatStreamingRun({
    source: ctx.wakeup.source,
    payloadJson: ctx.wakeup.payloadJson,
  });

  let streamSession = null;
  if (chatThreadId) {
    streamSession = await createChatStreamSession({
      organizationId: ctx.organizationId,
      threadId: chatThreadId,
      runId: ctx.runId,
      agentId: ctx.agent.id,
    });
  }

  try {
    const baseUserMessage = await renderWakeUserMessage({
      organizationId: ctx.organizationId,
      agentId: ctx.agent.id,
      runId: ctx.runId,
      source: ctx.wakeup.source,
      reason: ctx.wakeup.reason,
      payloadJson: ctx.wakeup.payloadJson,
    });

    const userMessage = isChatWakeup({
      source: ctx.wakeup.source,
      payloadJson: ctx.wakeup.payloadJson,
    })
      ? augmentUserMessageForRouting(
          baseUserMessage,
          resolveChatRoutingMode({
            agentType: ctx.agent.agentType,
            source: ctx.wakeup.source,
            reason: ctx.wakeup.reason,
          }),
        )
      : baseUserMessage;

    const mastra = await getMastra();
    let result: WorkflowRunOutput;

    const chatWakeup = isChatWakeup({
      source: ctx.wakeup.source,
      payloadJson: ctx.wakeup.payloadJson,
    });

    if (chatWakeup || streamSession) {
      result = await executeAidosAgentRun({
        mastra,
        agentType: ctx.agent.agentType,
        systemPrompt,
        userMessage,
        requestContext,
        permissions,
        streamSession,
      });
      if (streamSession) {
        await streamSession.emitRunComplete();
        await streamSession.finalize({ contentMarkdown: result.summary });
      }
    } else {
      const workflow = mastra.getWorkflow("heartbeatWorkflow");
      const run = await workflow.createRun();
      const workflowResult = await run.start({
        inputData: {
          agentType: ctx.agent.agentType,
          systemPrompt,
          userMessage,
          streamEnabled: true,
        },
        requestContext,
      });

      if (workflowResult.status !== "success" || !workflowResult.result) {
        throw new Error(`Heartbeat workflow failed: ${workflowResult.status}`);
      }
      result = workflowResult.result as WorkflowRunOutput;
    }

    return {
      status: "succeeded",
      summary: result.summary.slice(0, 2000),
      mastraRunId: result.mastraRunId,
      mastraTraceId: result.mastraTraceId,
      tokenUsage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        mode: "mastra",
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mastra adapter failed";
    if (streamSession) {
      await streamSession.emitRunError(message).catch(() => undefined);
      await streamSession.finalize({ error: message }).catch(() => undefined);
    }
    return {
      status: "failed",
      error: message,
      tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "mastra" },
    };
  }
}
