/**
 * Sidebar navigation feature flags.
 * Edit NAV_FEATURE_FLAGS to enable pages — see feature-flag.md.
 * Future: resolve flags via PostHog in isNavFeatureEnabled().
 */

export type NavFeatureFlagId =
  | "nav.dashboard"
  | "nav.workflow"
  | "nav.qa"
  | "nav.observability"
  | "nav.devops"
  | "nav.incidents"
  | "nav.recommendations"
  | "nav.approvals"
  | "nav.governance"
  | "nav.reports"
  | "nav.audit"
  | "nav.agents"
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
  "nav.observability": true,
  "nav.devops": true,
  "nav.incidents": true,
  "nav.recommendations": true,
  "nav.approvals": true,
  "nav.governance": true,
  "nav.reports": true,
  "nav.audit": true,
  "nav.agents": true,
  "nav.integrations": true,
  "nav.admin": true,
  "nav.settings": true,
  "nav.mvp_launchpad": true,
  "nav.mvp_new": true,
};

const NAV_HREF_TO_FLAG: Record<string, NavFeatureFlagId> = {
  "/dashboard": "nav.dashboard",
  "/workflow": "nav.workflow",
  "/qa": "nav.qa",
  "/observability": "nav.observability",
  "/devops": "nav.devops",
  "/incidents": "nav.incidents",
  "/recommendations": "nav.recommendations",
  "/approvals": "nav.approvals",
  "/governance": "nav.governance",
  "/reports": "nav.reports",
  "/audit": "nav.audit",
  "/agents": "nav.agents",
  "/integrations": "nav.integrations",
  "/admin": "nav.admin",
  "/settings": "nav.settings",
  "/accelerator": "nav.mvp_launchpad",
  "/accelerator/new": "nav.mvp_new",
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
  if (!flag) return true;
  return isNavFeatureEnabled(flag);
}

function resolvePathFlag(pathname: string): NavFeatureFlagId | null {
  if (pathname === "/accelerator/new" || pathname.startsWith("/accelerator/new/")) {
    return "nav.mvp_new";
  }
  if (pathname === "/accelerator" || pathname.startsWith("/accelerator/")) {
    return "nav.mvp_launchpad";
  }

  const exact = NAV_HREF_TO_FLAG[pathname];
  if (exact) return exact;

  const sortedHrefs = Object.keys(NAV_HREF_TO_FLAG)
    .filter((h) => h !== "/accelerator" && h !== "/accelerator/new")
    .sort((a, b) => b.length - a.length);

  for (const href of sortedHrefs) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return NAV_HREF_TO_FLAG[href];
    }
  }

  for (const { prefix, flag } of EXTRA_PATH_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return flag;
    }
  }

  return null;
}

/** Whether a platform pathname is allowed under current nav flags */
export function isNavPathEnabled(pathname: string): boolean {
  if (!pathname) return true;
  const flag = resolvePathFlag(pathname);
  if (!flag) return true;
  return isNavFeatureEnabled(flag);
}

export function getDefaultLandingPath(): string {
  if (isNavHrefEnabled("/integrations")) return "/integrations";
  if (isNavHrefEnabled("/settings")) return "/settings";
  return "/integrations";
}
