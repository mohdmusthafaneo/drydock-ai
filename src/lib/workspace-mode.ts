import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/generated/prisma/client";
import { isNavHrefEnabled } from "@/lib/feature-flags";
import type { IntegrationGateKey, IntegrationNavGates } from "@/lib/nav-availability";
import { DEFAULT_INTEGRATION_NAV_GATES } from "@/lib/nav-availability";
import {
  LayoutDashboard,
  GitBranch,
  Kanban,
  FlaskConical,
  Code2,
  Activity,
  Lightbulb,
  CheckSquare,
  Shield,
  ScrollText,
  MessagesSquare,
  Server,
  AlertTriangle,
  Plug,
  Settings,
  HeartPulse,
  TrendingUp,
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
    homePath: "/dashboard",
    accentClass: "from-mvp to-violet-400",
    badgeClass: "bg-mvp-muted text-mvp",
  },
  ENTERPRISE: {
    label: "Enterprise Workspace",
    tagline: "Governance & observability",
    description:
      "Enterprise operational intelligence shell — govern, observe, and orchestrate AI-native delivery (no autonomous agents yet).",
    homePath: "/dashboard",
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
      { href: "/dashboard", label: "Today", icon: LayoutDashboard, primary: true },
      { href: "/integrations", label: "Connect", icon: Plug },
    ],
    sections: [
      {
        id: "investigate",
        label: "Investigate",
        icon: Code2,
        items: [
          {
            href: "/delivery-analysis",
            label: "Delivery analysis",
            icon: Kanban,
            integrationGate: "deliveryAnalysis",
            lockedHint: "Connect Jira",
          },
          { href: "/qa", label: "QA intelligence", icon: FlaskConical },
          { href: "/devops", label: "DevOps", icon: Server },
          {
            href: "/code-analysis",
            label: "Code analysis",
            icon: Code2,
            integrationGate: "codeAnalysis",
            lockedHint: "Connect GitHub",
          },
          {
            href: "/observability",
            label: "Observability",
            icon: Activity,
            integrationGate: "observability",
            lockedHint: "Connect Prometheus",
          },
          { href: "/code-health", label: "Code health", icon: HeartPulse },
          { href: "/productivity", label: "Productivity", icon: TrendingUp },
          { href: "/incidents", label: "Incidents", icon: AlertTriangle },
        ],
      },
      {
        id: "ask",
        label: "Ask AIDOS",
        icon: MessagesSquare,
        items: [
          {
            href: "/agent-threads",
            label: "Conversations",
            icon: MessagesSquare,
            roleGate: ["ORG_ADMIN", "DELIVERY_MANAGER", "ENGINEERING_MANAGER", "DEVOPS_LEAD"],
          },
        ],
      },
      {
        id: "govern",
        label: "Govern",
        icon: Shield,
        defaultCollapsed: true,
        items: [
          { href: "/approvals", label: "Approval center", icon: CheckSquare },
          { href: "/recommendations", label: "Recommendations", icon: Lightbulb },
          { href: "/governance", label: "Delivery DNA", icon: Shield },
          { href: "/workflow", label: "Workflow center", icon: GitBranch },
          { href: "/audit", label: "Audit logs", icon: ScrollText },
        ],
      },
    ],
    bottomItems: [{ href: "/settings", label: "Settings", icon: Settings }],
  };
}

/** Constrained IA until DNA + first Jira/GitHub sync — Activate → Connect → DNA. */
export function getActivationNavLayout(hasDna: boolean): EnterpriseNavLayout {
  return {
    topItems: [
      {
        href: hasDna ? "/dashboard" : "/activate",
        label: hasDna ? "Today" : "Activate",
        icon: LayoutDashboard,
        primary: true,
      },
      { href: "/integrations", label: "Connect", icon: Plug },
      { href: "/governance/setup", label: "Delivery DNA", icon: Shield },
    ],
    sections: [],
    bottomItems: [{ href: "/settings", label: "Settings", icon: Settings }],
  };
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
export function getHomePath(mode: WorkspaceMode, hasDna: boolean): string {
  if (!hasDna) return "/activate";
  if (isNavHrefEnabled("/dashboard")) return "/dashboard";
  if (isNavHrefEnabled("/workflow")) return "/workflow";
  return getEnabledHomePath("ENTERPRISE");
}

export function isEnterpriseOnlyPath(pathname: string): boolean {
  const prefixes = [
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
