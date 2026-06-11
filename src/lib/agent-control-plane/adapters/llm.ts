import path from "node:path";
import { runAnthropicWithTools, runAnthropicWithToolsStreaming } from "../llm/anthropic";
import {
  assertAnthropicConfigured,
  resolveAnthropicConfig,
  resolveAidosApiBaseUrl,
} from "../llm/config";
import { readInstructionsBundleForAgent } from "../instructions/service";
import { parsePermissions } from "../agent-auth";
import { readCachedUtf8File } from "../prompt-cache";
import { buildChatContextMarkdown } from "@/lib/agent-chat/context";
import { createChatStreamSession, type ChatStreamSession } from "@/lib/agent-chat/stream";
import type { LlmStreamEvent } from "../llm/types";
import type { AdapterExecutionContext, AdapterExecutionResult } from "../types";
import { buildAidosLlmTools, executeAidosTool } from "./llm-tools";

const AIDOS_SKILL_PATH = path.join(process.cwd(), "skills/aidos/SKILL.md");
const CREATE_AGENT_SKILL_PATH = path.join(
  process.cwd(),
  "skills/aidos-create-agent/SKILL.md",
);
const SKILLS_ROOT = path.join(process.cwd(), "skills");

function parseDesiredSkills(adapterConfigJson: string): string[] {
  try {
    const parsed = JSON.parse(adapterConfigJson) as { desiredSkills?: string[] };
    return parsed.desiredSkills ?? ["aidos"];
  } catch {
    return ["aidos"];
  }
}

async function loadDomainSkill(skillName: string): Promise<string | null> {
  if (skillName === "aidos" || skillName === "aidos-create-agent") return null;
  try {
    return await readCachedUtf8File(
      path.join(SKILLS_ROOT, skillName, "SKILL.md"),
    );
  } catch {
    return null;
  }
}

async function loadDomainSkills(adapterConfigJson: string): Promise<string> {
  const names = parseDesiredSkills(adapterConfigJson).filter(
    (n) => n !== "aidos" && n !== "aidos-create-agent",
  );
  const sections: string[] = [];
  for (const name of names) {
    const content = await loadDomainSkill(name);
    if (content?.trim()) {
      sections.push(`## Skill: ${name}\n\n${content.trim()}`);
    }
  }
  return sections.join("\n\n---\n\n");
}

function parsePayload(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function loadAidosSkill(): Promise<string> {
  try {
    return await readCachedUtf8File(AIDOS_SKILL_PATH);
  } catch {
    return "# AIDOS skill missing — see skills/aidos/SKILL.md";
  }
}

async function loadCreateAgentSkill(): Promise<string> {
  try {
    const { loadCreateAgentRoleTemplates } = await import("../hire-templates");
    const [skill, templates] = await Promise.all([
      readCachedUtf8File(CREATE_AGENT_SKILL_PATH),
      loadCreateAgentRoleTemplates(),
    ]);
    return templates ? `${skill.trim()}\n\n---\n\n${templates}` : skill;
  } catch {
    return "";
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

function bundleSection(
  label: string,
  fileName: string,
  content: string | null | undefined,
): string {
  if (!content?.trim()) return "";
  return `\n\n---\n\n## ${label} (${fileName})\n\n${content}`;
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
  const [skill, domainSkills, createAgentSkill, bundle] = await Promise.all([
    loadAidosSkill(),
    loadDomainSkills(ctx.agent.adapterConfigJson),
    permissions.canCreateAgents ? loadCreateAgentSkill() : Promise.resolve(""),
    readInstructionsBundleForAgent(ctx.organizationId, ctx.agent),
  ]);

  const agentsMd = bundle.files[bundle.entryFile]?.content ?? "";
  const heartbeatMd = bundle.files.HEARTBEAT?.content ?? null;
  const chatMd = bundle.files.CHAT?.content ?? null;
  const toolsMd = bundle.files.TOOLS?.content ?? null;
  const initializeMd = bundle.files.INITIALIZE?.content ?? null;

  const systemPrompt = [
    skill,
    domainSkills ? `\n\n---\n\n${domainSkills}` : "",
    createAgentSkill ? `\n\n---\n\n${createAgentSkill}` : "",
    bundleSection("Agent charter", bundle.entryFile, agentsMd),
    bundleSection("Domain tools", "TOOLS.md", toolsMd),
    bundleSection("Heartbeat checklist", "HEARTBEAT.md", heartbeatMd),
    bundleSection("Chat participation", "CHAT.md", chatMd),
    bundleSection("Initialization playbook", "INITIALIZE.md", initializeMd),
  ]
    .filter(Boolean)
    .join("");

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
