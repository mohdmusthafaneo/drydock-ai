import { RequestContext } from "@mastra/core/request-context";

import {
  ORGANIZATION_ID_KEY,
  resolveOrganizationId,
} from "../../config/request-context";

export type AidosToolContext = {
  organizationId: string;
};

export const AIDOS_TOOL_CONTEXT_KEY = "aidosToolContext";

export type AidosRequestContextValues = {
  [AIDOS_TOOL_CONTEXT_KEY]: AidosToolContext;
  [ORGANIZATION_ID_KEY]: string;
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
  // Also set the flat key used by domain-agent tools (`resolveOrganizationId`).
  requestContext.set(ORGANIZATION_ID_KEY, toolContext.organizationId);
  return requestContext;
}

export function getAidosToolContext(context: {
  requestContext?: RequestContext<unknown>;
}): AidosToolContext {
  const nested = context.requestContext?.get(
    AIDOS_TOOL_CONTEXT_KEY,
  ) as AidosToolContext | undefined;
  if (nested?.organizationId) {
    return nested;
  }

  const organizationId = resolveOrganizationId(context.requestContext);
  if (organizationId) {
    return { organizationId };
  }

  throw new Error(
    "AIDOS tool context missing from requestContext — set aidosToolContext before agent execution",
  );
}
