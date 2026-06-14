import { runAnthropicWithTools, runAnthropicWithToolsStreaming } from "../llm/anthropic";
import {
  assertAnthropicConfigured,
  resolveAnthropicConfig,
  resolveAidosApiBaseUrl,
} from "../llm/config";
import { parsePermissions } from "../agent-auth";
import { buildChatContextMarkdown } from "@/lib/agent-chat/context";
import { createChatStreamSession, type ChatStreamSession } from "@/lib/agent-chat/stream";
import { loadAgentInstructionContext } from "@/mastra/context/instructions";
import type { LlmStreamEvent } from "../llm/types";
import type { AdapterExecutionContext, AdapterExecutionResult } from "../types";
import { buildAidosLlmTools, executeAidosTool } from "./llm-tools";

function parsePayload(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function renderWakeUserMessage(ctx: AdapterExecutionContext): Promise<string> {
  const payload = parsePayload(ctx.wakeup.payloadJson);
  const threadId =
    typeof payload.threadId === "string" ? payload.threadId : undefined;

  if (threadId) {
    const chatContext = await buildChatContextMarkdown(
      ctx.organizationId,
      threadId,
      ctx.agent.id,
    );
    if (chatContext) {
      const approvalLines =
        ctx.wakeup.source === "approval" && typeof payload.approvalId === "string"
          ? [
              "",
              "## Approval decision",
              `- approvalId: ${payload.approvalId}`,
              `- decision: ${String(payload.decision ?? "unknown")}`,
              "- Resume the requested action if approved; post your result via aidos_post_thread_message.",
              "- If rejected, explain the outcome briefly in the thread.",
            ]
          : [];

      return [
        chatContext,
        "",
        "## Wake metadata",
        `- source: ${ctx.wakeup.source}`,
        `- reason: ${ctx.wakeup.reason}`,
        `- runId: ${ctx.runId}`,
        `- triggerMessageId: ${String(payload.triggerMessageId ?? "")}`,
        ...approvalLines,
        "",
        "Follow HEARTBEAT.md and skills/aidos/SKILL.md.",
        "Use tools for all mutations. Post thread replies via aidos_post_thread_message.",
        "Super Agent may close resolved threads via aidos_close_thread.",
        "Critical actions require aidos_request_approval before execution.",
        "When work is blocked pending human approval, summarize and stop.",
      ].join("\n");
    }
  }

  return [
    "## Heartbeat wake context",
    `- source: ${ctx.wakeup.source}`,
    `- reason: ${ctx.wakeup.reason}`,
    `- runId: ${ctx.runId}`,
    `- payload: ${JSON.stringify(payload)}`,
    "",
    "Follow HEARTBEAT.md and skills/aidos/SKILL.md.",
    "Use tools for all mutations. Include X-Run-Id on every write (handled by tools).",
    "When inbox is clear or work is blocked pending human approval, summarize and stop.",
  ].join("\n");
}

function isChatStreamingRun(ctx: AdapterExecutionContext): string | undefined {
  const payload = parsePayload(ctx.wakeup.payloadJson);
  const threadId =
    typeof payload.threadId === "string" ? payload.threadId : undefined;
  if (!threadId) return undefined;
  if (ctx.wakeup.source === "chat") return threadId;
  if (ctx.wakeup.source === "delegation") return threadId;
  return undefined;
}

async function mapStreamEvent(
  session: ChatStreamSession,
  event: LlmStreamEvent,
): Promise<void> {
  switch (event.kind) {
    case "text_delta":
      await session.emitTextDelta(event.text);
      break;
    case "thinking_delta":
      await session.emitThinkingDelta(event.thinking);
      break;
    case "tool_start":
      await session.emitToolStart(event.tool, event.input);
      break;
    case "tool_end":
      await session.emitToolEnd(event.tool, event.outputPreview);
      break;
  }
}

export async function runLlmAdapter(
  ctx: AdapterExecutionContext & { agentApiKey: string },
): Promise<AdapterExecutionResult> {
  const anthropicConfig = resolveAnthropicConfig(ctx.agent.adapterConfigJson);

  try {
    assertAnthropicConfigured(anthropicConfig);
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "LLM not configured",
      tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
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

  const tools = buildAidosLlmTools(ctx.agent.agentType, permissions);
  const toolCtx = {
    apiBaseUrl: resolveAidosApiBaseUrl(),
    agentApiKey: ctx.agentApiKey,
    runId: ctx.runId,
    wakePayload,
  };

  const chatThreadId = isChatStreamingRun(ctx);
  let streamSession: ChatStreamSession | null = null;

  if (chatThreadId) {
    streamSession = await createChatStreamSession({
      organizationId: ctx.organizationId,
      threadId: chatThreadId,
      runId: ctx.runId,
      agentId: ctx.agent.id,
    });
  }

  const wrappedExecuteTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> => {
    const result = await executeAidosTool(name, args, toolCtx);
    return result;
  };

  try {
    const userMessage = await renderWakeUserMessage(ctx);

    const result = streamSession
      ? await runAnthropicWithToolsStreaming({
          config: anthropicConfig,
          systemPrompt,
          userMessage,
          tools,
          executeTool: wrappedExecuteTool,
          maxRounds: 15,
          onStreamEvent: (event) => mapStreamEvent(streamSession!, event),
        })
      : await runAnthropicWithTools({
          config: anthropicConfig,
          systemPrompt,
          userMessage,
          tools,
          executeTool: wrappedExecuteTool,
          maxRounds: 15,
        });

    if (streamSession) {
      await streamSession.emitRunComplete();
      await streamSession.finalize({ contentMarkdown: result.summary });
    }

    return {
      status: "succeeded",
      summary: result.summary.slice(0, 2000),
      tokenUsage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        mode: result.mode,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM adapter failed";
    if (streamSession) {
      await streamSession.emitRunError(message).catch(() => undefined);
      await streamSession.finalize({ error: message }).catch(() => undefined);
    }
    return {
      status: "failed",
      error: message,
      tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "anthropic" },
    };
  }
}
