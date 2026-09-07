/**
 * Preserve Overview team/sprint context on outbound links.
 * Maps `team` → `projectKey` for delivery-analysis deep-links.
 */

export type OverviewNavContext = {
  team?: string | null;
  sprint?: string | null;
};

export function withOverviewContext(
  href: string,
  context: OverviewNavContext,
): string {
  const [pathPart, existingQuery = ""] = href.split("?");
  const params = new URLSearchParams(existingQuery);

  if (context.team) {
    params.set("team", context.team);
    if (pathPart === "/delivery-analysis" || pathPart?.startsWith("/delivery-analysis")) {
      if (!params.has("projectKey")) params.set("projectKey", context.team);
    }
  }

  if (context.sprint) {
    params.set("sprint", context.sprint);
  }

  const qs = params.toString();
  return qs ? `${pathPart}?${qs}` : (pathPart ?? href);
}

export const PILLAR_HREFS: Record<string, string> = {
  delivery: "/delivery-analysis",
  code: "/code-analysis",
  qa: "/qa",
  compliance: "/governance",
};

export const METRIC_HREFS: Record<string, string> = {
  completion: "/delivery-analysis?riskFocus=sprint",
  blocked: "/delivery-analysis?riskFocus=blockers",
  spillover: "/delivery-analysis?riskFocus=schedule",
  "at-risk": "/delivery-analysis?riskFocus=schedule",
  "ai-risk": "/code-analysis",
};
