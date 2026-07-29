import type { RequestContext } from "@mastra/core/request-context";

export const ORGANIZATION_ID_KEY = "organizationId" as const;

export type AidosRequestContextValues = {
  [ORGANIZATION_ID_KEY]: string;
};

export function resolveOrganizationId(
  requestContext: RequestContext<unknown> | undefined,
  fallback?: string | undefined,
): string | undefined {
  const fromContext = requestContext?.get(ORGANIZATION_ID_KEY);
  if (typeof fromContext === "string" && fromContext.trim()) return fromContext;
  if (typeof fallback === "string" && fallback.trim()) return fallback;
  return undefined;
}

