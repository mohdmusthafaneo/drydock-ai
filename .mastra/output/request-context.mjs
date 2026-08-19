const ORGANIZATION_ID_KEY = "organizationId";
function resolveOrganizationId(requestContext, fallback) {
  const fromContext = requestContext?.get(ORGANIZATION_ID_KEY);
  if (typeof fromContext === "string" && fromContext.trim()) return fromContext;
  if (typeof fallback === "string" && fallback.trim()) return fallback;
  return void 0;
}

export { resolveOrganizationId as r };
