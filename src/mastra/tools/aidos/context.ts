import { RequestContext } from "@mastra/core/request-context";

import { resolveAidosApiBaseUrl } from "@/lib/agent-control-plane/llm/config";

export type AidosToolContext = {
  apiBaseUrl: string;
  agentApiKey: string;
  runId: string;
  wakePayload: Record<string, unknown>;
};

export const AIDOS_TOOL_CONTEXT_KEY = "aidosToolContext";

export type AidosRequestContextValues = {
  [AIDOS_TOOL_CONTEXT_KEY]: AidosToolContext;
};

/** Build runtime tool context from worker / adapter execution inputs. */
export function createAidosToolContext(input: {
  apiBaseUrl?: string;
  agentApiKey: string;
  runId: string;
  wakePayload?: Record<string, unknown>;
}): AidosToolContext {
  return {
    apiBaseUrl: (input.apiBaseUrl ?? resolveAidosApiBaseUrl()).replace(/\/$/, ""),
    agentApiKey: input.agentApiKey,
    runId: input.runId,
    wakePayload: input.wakePayload ?? {},
  };
}

export function createAidosRequestContext(
  toolContext: AidosToolContext,
): RequestContext<AidosRequestContextValues> {
  const requestContext = new RequestContext<AidosRequestContextValues>();
  requestContext.set(AIDOS_TOOL_CONTEXT_KEY, toolContext);
  return requestContext;
}

export function getAidosToolContext(context: {
  requestContext?: RequestContext<unknown>;
}): AidosToolContext {
  const toolContext = context.requestContext?.get(
    AIDOS_TOOL_CONTEXT_KEY,
  ) as AidosToolContext | undefined;
  if (!toolContext) {
    throw new Error(
      "AIDOS tool context missing from requestContext — set aidosToolContext before agent execution",
    );
  }
  return toolContext;
}
