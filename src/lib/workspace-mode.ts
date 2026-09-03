import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/generated/prisma/client";
import { isNavHrefEnabled } from "@/lib/feature-flags";
import type { IntegrationGateKey, IntegrationNavGates } from "@/lib/nav-availability";
import { DEFAULT_INTEGRATION_NAV_GATES } from "@/lib/nav-availability";
import {
  LayoutDashboard,
  BookOpen,
  Package,
  Plug,
  Settings,
} from "lucide-react";

export type WorkspaceMode = "MVP" | "ENTERPRISE";

export const WORKSPACE_META: Record<
  WorkspaceMode,
  {
    label: string;
    tagline: string;
    description: string;
    homePath: string;
    accentClass: string;
    badgeClass: string;
  }
> = {
  MVP: {
    label: "MVP Workspace",
    tagline: "",
    description: "Build products — PRD, architecture, Jira epics, and launch plans.",
    homePath: "/briefing",
    accentClass: "from-mvp to-violet-400",
    badgeClass: "bg-mvp-muted text-mvp",
  },
  ENTERPRISE: {
    label: "DryDock",
    tagline: "Trust green",
    description:
      "Signal integrity for the QA Architect — trust counts, the Ledger, and today's Briefing.",
    homePath: "/briefing",
    accentClass: "from-accent to-amber-300",
    badgeClass: "bg-accent/15 text-accent",
  },
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
  integrationGate?: IntegrationGateKey;
  lockedHint?: string;
  /** When set, only these roles see the nav item */
  roleGate?: UserRole[];
};

export type ResolvedNavItem = NavItem & {
  locked: boolean;
  resolvedHref: string;
};

export type NavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  defaultCollapsed?: boolean;
  items: NavItem[];
};

export type ResolvedNavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  defaultCollapsed?: boolean;
  items: ResolvedNavItem[];
};

export type EnterpriseNavLayout = {
  topItems: NavItem[];
  sections: NavSection[];
  bottomItems: NavItem[];
};

export type ResolvedEnterpriseNavLayout = {
  topItems: ResolvedNavItem[];
  sections: ResolvedNavSection[];
  bottomItems: ResolvedNavItem[];
};

export function getEnterpriseNavLayout(): EnterpriseNavLayout {
  return {
    topItems: [
      { href: "/briefing", label: "Briefing", icon: LayoutDashboard, primary: true },
      { href: "/ledger", label: "Ledger", icon: BookOpen },
      { href: "/releases", label: "Releases", icon: Package },
      { href: "/integrations", label: "Connect", icon: Plug },
    ],
    sections: [],
    bottomItems: [{ href: "/settings", label: "Settings", icon: Settings }],
  };
}

/** DryDock skips the AIDOS activation funnel — Briefing is always available. */
export function getActivationNavLayout(_hasDna: boolean): EnterpriseNavLayout {
  return getEnterpriseNavLayout();
}

function flattenEnterpriseNavLayout(layout: EnterpriseNavLayout): NavItem[] {
  return [
    ...layout.topItems,
    ...layout.sections.flatMap((section) => section.items),
    ...layout.bottomItems,
  ];
}

function filterFlagEnabledItems(items: NavItem[]): NavItem[] {
  return items.filter((item) => isNavHrefEnabled(item.href));
}

function isNavItemAllowedForRole(item: NavItem, userRole?: UserRole): boolean {
  if (!item.roleGate || item.roleGate.length === 0) return true;
  if (!userRole) return true;
  return item.roleGate.includes(userRole);
}

function filterRoleAllowedItems(items: NavItem[], userRole?: UserRole): NavItem[] {
  return items.filter((item) => isNavItemAllowedForRole(item, userRole));
}

export function resolveNavItem(
  item: NavItem,
  gates: IntegrationNavGates = DEFAULT_INTEGRATION_NAV_GATES,
): ResolvedNavItem {
  const gateOpen = !item.integrationGate || gates[item.integrationGate];
  const locked = Boolean(item.integrationGate && !gateOpen);

  return {
    ...item,
    locked,
    resolvedHref: locked ? "/integrations" : item.href,
  };
}

export function getResolvedEnterpriseNavLayout(
  gates: IntegrationNavGates = DEFAULT_INTEGRATION_NAV_GATES,
  userRole?: UserRole,
  options?: { activationMode?: boolean; hasDna?: boolean },
): ResolvedEnterpriseNavLayout {
  const layout = options?.activationMode
    ? getActivationNavLayout(Boolean(options.hasDna))
    : getEnterpriseNavLayout();

  return {
    topItems: filterRoleAllowedItems(filterFlagEnabledItems(layout.topItems), userRole).map(
      (item) => resolveNavItem(item, gates),
    ),
    sections: layout.sections
      .map((section) => ({
        ...section,
        items: filterRoleAllowedItems(filterFlagEnabledItems(section.items), userRole).map(
          (item) => resolveNavItem(item, gates),
        ),
      }))
      .filter((section) => section.items.length > 0),
    bottomItems: filterRoleAllowedItems(filterFlagEnabledItems(layout.bottomItems), userRole).map(
      (item) => resolveNavItem(item, gates),
    ),
  };
}

/** Sidebar items after nav feature flags (flat list for all modes) */
export function getEnabledNavForMode(
  _mode: WorkspaceMode,
  gates: IntegrationNavGates = DEFAULT_INTEGRATION_NAV_GATES,
): NavItem[] {
  const layout = getResolvedEnterpriseNavLayout(gates);
  return [
    ...layout.topItems,
    ...layout.sections.flatMap((section) => section.items),
    ...layout.bottomItems,
  ];
}

export function getEnabledHomePath(mode: WorkspaceMode): string {
  if (mode === "ENTERPRISE") {
    const layout = getResolvedEnterpriseNavLayout();
    const primary = layout.topItems.find((item) => item.primary);
    if (primary) return primary.resolvedHref;
    if (layout.topItems.length > 0) return layout.topItems[0].resolvedHref;
    if (layout.bottomItems.length > 0) return layout.bottomItems[0].resolvedHref;
    return "/integrations";
  }

  const nav = getEnabledNavForMode(mode);
  const primary = nav.find((item) => item.primary);
  if (primary) return primary.href;
  if (nav.length > 0) return nav[0].href;
  return "/integrations";
}

/** @deprecated Prefer resolveLandingPath from @/lib/landing-path or getLandingPathForOrganization */
export function getHomePath(_mode: WorkspaceMode, _hasDna: boolean): string {
  if (isNavHrefEnabled("/briefing")) return "/briefing";
  if (isNavHrefEnabled("/ledger")) return "/ledger";
  return getEnabledHomePath("ENTERPRISE");
}

export function isEnterpriseOnlyPath(pathname: string): boolean {
  const prefixes = [
    "/briefing",
    "/ledger",
    "/activate",
    "/discovery",
    "/delivery-dna",
    "/dashboard",
    "/workflow",
    "/releases",
    "/qa",
    "/delivery-analysis",
    "/code-analysis",
    "/observability",
    "/devops",
    "/incidents",
    "/recommendations",
    "/approvals",
    "/governance",
    "/audit",
    "/agent-threads",
  ];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Best-effort page title from pathname for the app header. */
export function resolvePageTitleForPath(
  pathname: string,
  mode: WorkspaceMode,
  gates: IntegrationNavGates = DEFAULT_INTEGRATION_NAV_GATES,
): string {
  const items = getEnabledNavForMode(mode, gates);
  const sorted = [...items].sort((a, b) => b.href.length - a.href.length);
  const match = sorted.find((item) => isNavItemActive(pathname, item.href));
  if (match) return match.label;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return WORKSPACE_META[mode].label;

  const last = segments[segments.length - 1]!;
  if (looksLikeOpaqueId(last)) {
    const parent = segments[segments.length - 2];
    if (parent) {
      return parent
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
    return parentSlugFallback(segments);
  }

  return last
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** True when a URL segment looks like a database id rather than a human-readable slug.
 * Catches: hex/UUID (existing pattern), all-digit ids, CUIDv1/v2 (e.g. `cms640nhu001c4s0mnjw5esgw`),
 * and any alphanumeric token that is long enough to not be a real slug.
 */
function looksLikeOpaqueId(segment: string): boolean {
  if (!segment) return false;
  // Keep treating short numeric and hex strings as ids.
  if (/^[a-f0-9-]{8,}$/i.test(segment)) return true;
  if (/^\d+$/.test(segment)) return true;
  // CUIDs and similar: starts with a letter, then mix of alphanumerics with no dashes,
  // length >= 16. A real slug will either be short or contain dashes separating words.
  if (/^[a-z][a-z0-9]+$/i.test(segment) && segment.length >= 16) return true;
  return false;
}

function parentSlugFallback(segments: string[]): string {
  for (let i = segments.length - 2; i >= 0; i--) {
    const seg = segments[i]!;
    if (!looksLikeOpaqueId(seg)) {
      return seg
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }
  return WORKSPACE_META["ENTERPRISE"].label;
}
