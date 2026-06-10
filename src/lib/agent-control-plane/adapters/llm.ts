import fs from "node:fs/promises";
import path from "node:path";
import { runAnthropicWithTools } from "../llm/anthropic";
import {
  assertAnthropicConfigured,
  resolveAnthropicConfig,
  resolveAidosApiBaseUrl,
} from "../llm/config";
import { readInstructionsBundleForAgent } from "../instructions/service";
import { parsePermissions } from "../agent-auth";
import type { AdapterExecutionContext, AdapterExecutionResult } from "../types";
import { buildAidosLlmTools, executeAidosTool } from "./llm-tools";

const AIDOS_SKILL_PATH = path.join(process.cwd(), "skills/aidos/SKILL.md");
const CREATE_AGENT_SKILL_PATH = path.join(
  process.cwd(),
  "skills/aidos-create-agent/SKILL.md",
);

function parsePayload(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function loadAidosSkill(): Promise<string> {
  try {
    return await fs.readFile(AIDOS_SKILL_PATH, "utf8");
  } catch {
    return "# AIDOS skill missing — see skills/aidos/SKILL.md";
  }
}

async function loadCreateAgentSkill(): Promise<string> {
  try {
    const { loadCreateAgentRoleTemplates } = await import("../hire-templates");
    const [skill, templates] = await Promise.all([
      fs.readFile(CREATE_AGENT_SKILL_PATH, "utf8"),
      loadCreateAgentRoleTemplates(),
    ]);
    return templates ? `${skill.trim()}\n\n---\n\n${templates}` : skill;
  } catch {
    return "";
  }
}

function renderWakeUserMessage(ctx: AdapterExecutionContext): string {
  const payload = parsePayload(ctx.wakeup.payloadJson);
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
  const [skill, createAgentSkill, bundle] = await Promise.all([
    loadAidosSkill(),
    permissions.canCreateAgents ? loadCreateAgentSkill() : Promise.resolve(""),
    readInstructionsBundleForAgent(ctx.organizationId, ctx.agent),
  ]);

  const agentsMd = bundle.files[bundle.entryFile]?.content ?? "";
  const heartbeatMd = bundle.files.HEARTBEAT?.content ?? null;
  const toolsMd = bundle.files.TOOLS?.content ?? null;
  const initializeMd = bundle.files.INITIALIZE?.content ?? null;

  const systemPrompt = [
    skill,
    createAgentSkill ? `\n\n---\n\n${createAgentSkill}` : "",
    bundleSection("Agent charter", bundle.entryFile, agentsMd),
    bundleSection("Domain tools", "TOOLS.md", toolsMd),
    bundleSection("Heartbeat checklist", "HEARTBEAT.md", heartbeatMd),
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

  try {
    const result = await runAnthropicWithTools({
      config: anthropicConfig,
      systemPrompt,
      userMessage: renderWakeUserMessage(ctx),
      tools,
      executeTool: (name, args) => executeAidosTool(name, args, toolCtx),
      maxRounds: 15,
    });

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
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "LLM adapter failed",
      tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "anthropic" },
    };
  }
}
