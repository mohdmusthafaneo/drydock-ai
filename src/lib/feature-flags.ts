/**
 * Sidebar navigation feature flags.
 * Edit NAV_FEATURE_FLAGS to enable pages — see feature-flag.md.
 * Future: resolve flags via PostHog in isNavFeatureEnabled().
 */

export type NavFeatureFlagId =
  | "nav.dashboard"
  | "nav.workflow"
  | "nav.qa"
  | "nav.code_analysis"
  | "nav.delivery_analysis"
  | "nav.observability"
  | "nav.devops"
  | "nav.incidents"
  | "nav.recommendations"
  | "nav.approvals"
  | "nav.governance"
  | "nav.audit"
  | "nav.agent_threads"
  | "nav.integrations"
  | "nav.admin"
  | "nav.settings"
  | "nav.mvp_launchpad"
  | "nav.mvp_new";

/** Toggle nav pages here. Set to false to hide a route from nav and block direct access. */
export const NAV_FEATURE_FLAGS: Record<NavFeatureFlagId, boolean> = {
  "nav.dashboard": true,
  "nav.workflow": true,
  "nav.qa": true,
  "nav.code_analysis": true,
  "nav.delivery_analysis": true,
  "nav.observability": true,
  "nav.devops": true,
  "nav.incidents": true,
  "nav.recommendations": true,
  "nav.approvals": true,
  "nav.governance": true,
  "nav.audit": true,
  "nav.agent_threads": true,
  "nav.integrations": true,
  "nav.admin": false,
  "nav.settings": true,
  "nav.mvp_launchpad": true,
  "nav.mvp_new": true,
};

const NAV_HREF_TO_FLAG: Record<string, NavFeatureFlagId> = {
  "/dashboard": "nav.dashboard",
  "/workflow": "nav.workflow",
  "/qa": "nav.qa",
  "/code-analysis": "nav.code_analysis",
  "/delivery-analysis": "nav.delivery_analysis",
  "/observability": "nav.observability",
  "/devops": "nav.devops",
  "/incidents": "nav.incidents",
  "/recommendations": "nav.recommendations",
  "/approvals": "nav.approvals",
  "/governance": "nav.governance",
  "/audit": "nav.audit",
  "/agent-threads": "nav.agent_threads",
  "/integrations": "nav.integrations",
  "/admin": "nav.admin",
  "/settings": "nav.settings",
};

/** Related routes not listed in the sidebar but tied to a nav flag */
const EXTRA_PATH_PREFIXES: { prefix: string; flag: NavFeatureFlagId }[] = [
  { prefix: "/releases", flag: "nav.workflow" },
  { prefix: "/discovery", flag: "nav.governance" },
  { prefix: "/delivery-dna", flag: "nav.governance" },
];

export function isNavFeatureEnabled(id: NavFeatureFlagId): boolean {
  return NAV_FEATURE_FLAGS[id] ?? false;
}

export function isNavHrefEnabled(href: string): boolean {
  const flag = NAV_HREF_TO_FLAG[href];
  return flag ? NAV_FEATURE_FLAGS[flag] : true;
}

function resolvePathFlag(pathname: string): NavFeatureFlagId | null {
  // Exact match
  if (pathname in NAV_HREF_TO_FLAG) return NAV_HREF_TO_FLAG[pathname];
  // Prefix match — most specific (longest) match wins
  let best: NavFeatureFlagId | null = null;
  let bestLen = 0;
  for (const [prefix, flag] of Object.entries(NAV_HREF_TO_FLAG)) {
    if (
      (pathname === prefix || pathname.startsWith(prefix + "/")) &&
      prefix.length > bestLen
    ) {
      best = flag;
      bestLen = prefix.length;
    }
  }
  return best;
}

/** Whether a platform pathname is allowed under current nav flags */
export function isNavPathEnabled(pathname: string): boolean {
  // Extra prefixes bypass NAV_HREF_TO_FLAG
  for (const { prefix, flag } of EXTRA_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return !!NAV_FEATURE_FLAGS[flag];
  }
  const flag = resolvePathFlag(pathname);
  return flag ? !!NAV_FEATURE_FLAGS[flag] : true;
}

export function getDefaultLandingPath(): string {
  return "/dashboard";
}
