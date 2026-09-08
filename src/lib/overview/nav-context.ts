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
  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const [pathPart, existingQuery = ""] = withoutHash.split("?");
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
  const base = qs ? `${pathPart}?${qs}` : (pathPart ?? withoutHash);
  return `${base}${hash}`;
}

/** Hash target for Overview gauge → Delivery “how score is derived” panel. */
export const SCORE_DERIVATION_HASH = "score-derivation";

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
