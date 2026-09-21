import { RequestContext } from "@mastra/core/request-context";

import { DEFAULT_FILTERS } from "@/lib/store/dimensions";
import { resolveMockSeed } from "@/lib/store/mock";
import type { AppStoreState } from "@/lib/store/types";

export type DrydockAssistantToolContext = {
  email: string;
  organizationId: string;
  userName: string;
  team: string | null;
  sprint: string | null;
};

export const DRYDOCK_ASSISTANT_TOOL_CONTEXT_KEY = "drydockAssistantToolContext";

export type DrydockAssistantRequestContextValues = {
  [DRYDOCK_ASSISTANT_TOOL_CONTEXT_KEY]: DrydockAssistantToolContext;
};

export function createDrydockAssistantToolContext(input: {
  email: string;
  organizationId: string;
  userName: string;
  team?: string | null;
  sprint?: string | null;
}): DrydockAssistantToolContext {
  return {
    email: input.email.trim().toLowerCase(),
    organizationId: input.organizationId,
    userName: input.userName,
    team: input.team ?? null,
    sprint: input.sprint ?? null,
  };
}

export function createDrydockAssistantRequestContext(
  toolContext: DrydockAssistantToolContext,
): RequestContext<DrydockAssistantRequestContextValues> {
  const requestContext =
    new RequestContext<DrydockAssistantRequestContextValues>();
  requestContext.set(DRYDOCK_ASSISTANT_TOOL_CONTEXT_KEY, toolContext);
  return requestContext;
}

export function getDrydockAssistantToolContext(context: {
  requestContext?: RequestContext<unknown>;
}): DrydockAssistantToolContext {
  const nested = context.requestContext?.get(
    DRYDOCK_ASSISTANT_TOOL_CONTEXT_KEY,
  ) as DrydockAssistantToolContext | undefined;
  if (nested?.email) {
    return nested;
  }
  throw new Error(
    "DryDock assistant tool context missing — set drydockAssistantToolContext before agent execution",
  );
}

/** Build the same AppStoreState the Overview UI reads (mock seed + filters). */
export function loadDrydockAssistantState(
  ctx: DrydockAssistantToolContext,
): AppStoreState {
  const seed = resolveMockSeed({ email: ctx.email });
  const greetingName = ctx.userName.split(" ")[0] || ctx.userName;
  return {
    data: {
      ...seed,
      user: {
        ...seed.user,
        name: ctx.userName,
        greetingName,
      },
    },
    filters: {
      ...DEFAULT_FILTERS,
      team: ctx.team,
      sprint: ctx.sprint,
    },
    status: "ready",
    error: null,
  };
}
