import type { AgentWakeupSource } from "@/generated/prisma/client";
import { readJsonField } from "@/lib/json-field";
import { resolveAidosApiBaseUrl } from "../llm/config";
import type { AdapterExecutionContext } from "../types";

function parsePayload(json: unknown): Record<string, unknown> {
  return readJsonField<Record<string, unknown>>(json, {});
}

/** Shared wake payload for http/process adapters (Paperclip-style env + JSON body). */
export function buildAdapterWakePayload(
  ctx: AdapterExecutionContext & { agentApiKey: string },
) {
  const payload = parsePayload(ctx.wakeup.payloadJson);

  return {
    runId: ctx.runId,
    agentId: ctx.agent.id,
    organizationId: ctx.organizationId,
    agentType: ctx.agent.agentType,
    role: ctx.agent.role,
    displayName: ctx.agent.displayName,
    adapterType: ctx.agent.adapterType,
    apiUrl: resolveAidosApiBaseUrl(),
    apiKey: ctx.agentApiKey,
    wakeup: {
      id: ctx.wakeup.id,
      source: ctx.wakeup.source as AgentWakeupSource,
      reason: ctx.wakeup.reason,
      payload,
    },
    env: {
      AIDOS_AGENT_ID: ctx.agent.id,
      AIDOS_RUN_ID: ctx.runId,
      AIDOS_API_KEY: ctx.agentApiKey,
      AIDOS_API_URL: resolveAidosApiBaseUrl(),
      AIDOS_ORGANIZATION_ID: ctx.organizationId,
      AIDOS_WAKEUP_SOURCE: ctx.wakeup.source,
      AIDOS_WAKEUP_REASON: ctx.wakeup.reason,
      AIDOS_WAKEUP_PAYLOAD: JSON.stringify(payload),
    },
  };
}
