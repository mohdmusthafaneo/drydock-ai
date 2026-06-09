/**
 * @deprecated Prototype rule-engine adapter from Phase 5a/5b.
 * Replaced by `adapters/llm.ts` in Phase 5.2 — LLM reads AGENTS.md + SKILL.md
 * and calls AIDOS agent APIs via tools. Do not extend this module.
 * @see docs/ai-agents-workflow.md §3.4
 */
import { buildAgentInbox } from "../inbox";
import type { AdapterExecutionContext, AdapterExecutionResult } from "../types";

function parsePayload(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** @deprecated Use `runLlmAdapter` from `./llm` (Phase 5.2). */
export async function runInternalAdapter(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const payload = parsePayload(ctx.wakeup.payloadJson);
  const inbox = await buildAgentInbox(ctx.agent, payload);

  const summary = [
    `Heartbeat for ${ctx.agent.displayName} (${ctx.agent.agentType})`,
    `source=${ctx.wakeup.source} reason=${ctx.wakeup.reason}`,
    inbox.length > 0
      ? `${inbox.length} inbox item(s) — configure adapterType=llm for LLM execution`
      : "No inbox items",
  ].join(" · ");

  return {
    status: "succeeded",
    summary,
    tokenUsage: { inputTokens: 0, outputTokens: 0, mode: "rule-engine" },
  };
}
