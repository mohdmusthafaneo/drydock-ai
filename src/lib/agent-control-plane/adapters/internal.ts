import type { AdapterExecutionContext, AdapterExecutionResult } from "../types";

/**
 * Phase 5a stub: logs execution context and returns a success summary.
 * Phase 5b replaces this with OpenAI + tool allowlist.
 */
export async function runInternalAdapter(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const payload = (() => {
    try {
      return JSON.parse(ctx.wakeup.payloadJson) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  const summary = [
    `Stub heartbeat for ${ctx.agent.displayName} (${ctx.agent.agentType})`,
    `source=${ctx.wakeup.source} reason=${ctx.wakeup.reason}`,
    Object.keys(payload).length > 0
      ? `payload=${JSON.stringify(payload)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    status: "succeeded",
    summary,
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
  };
}
