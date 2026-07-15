import { RequestContext } from "@mastra/core/request-context";

export type AidosToolContext = {
  organizationId: string;
};

export const AIDOS_TOOL_CONTEXT_KEY = "aidosToolContext";

export type AidosRequestContextValues = {
  [AIDOS_TOOL_CONTEXT_KEY]: AidosToolContext;
};

/** Build runtime tool context for in-process assistant runs. */
export function createAidosToolContext(input: {
  organizationId: string;
}): AidosToolContext {
  return {
    organizationId: input.organizationId,
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
