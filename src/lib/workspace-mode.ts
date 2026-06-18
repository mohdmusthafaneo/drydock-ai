import type { LucideIcon } from "lucide-react";
import { isNavHrefEnabled } from "@/lib/feature-flags";
import type { IntegrationGateKey, IntegrationNavGates } from "@/lib/nav-availability";
import { DEFAULT_INTEGRATION_NAV_GATES } from "@/lib/nav-availability";
import {
  LayoutDashboard,
  Rocket,
  GitBranch,
  Kanban,
  FlaskConical,
  Code2,
  Activity,
  Lightbulb,
  CheckSquare,
  Shield,
  BarChart3,
  ScrollText,
  Bot,
  MessagesSquare,
  Server,
  AlertTriangle,
  Plug,
  Settings,
  Users,
  Plus,
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
    tagline: "Idea to launch, fast",
    description: "Build products — PRD, architecture, Jira epics, and launch plans.",
    homePath: "/accelerator",
    accentClass: "from-mvp to-violet-400",
    badgeClass: "bg-mvp-muted text-mvp",
  },
  ENTERPRISE: {
    label: "Enterprise Workspace",
    tagline: "Phase 1 · Governance & observability foundation",
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
};

export type ResolvedNavItem = NavItem & {
  locked: boolean;
  resolvedHref: string;
};

export type NavSection = {
  id: string;
  label: string;
  defaultCollapsed?: boolean;
  items: NavItem[];
};

export type ResolvedNavSection = {
  id: string;
  label: string;
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

/** Master FRD §9 — Application Pages (full catalog) */
export function getNavForMode(mode: WorkspaceMode): NavItem[] {
  if (mode === "MVP") {
    return [
      { href: "/accelerator", label: "Launchpad", icon: Rocket, primary: true },
      { href: "/accelerator/new", label: "New MVP", icon: Plus },
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
    ];
  }

  return flattenEnterpriseNavLayout(getEnterpriseNavLayout());
}

export function getEnterpriseNavLayout(): EnterpriseNavLayout {
  return {
    topItems: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/workflow", label: "Workflow center", icon: GitBranch },
    ],
    sections: [
      {
        id: "analysis",
        label: "Analysis",
        items: [
          {
            href: "/code-analysis",
            label: "Code analysis",
            icon: Code2,
            integrationGate: "codeAnalysis",
            lockedHint: "Connect GitHub",
          },
          {
            href: "/delivery-analysis",
            label: "Delivery analysis",
            icon: Kanban,
            integrationGate: "deliveryAnalysis",
            lockedHint: "Connect Jira",
          },
          {
            href: "/observability",
            label: "Observability",
            icon: Activity,
            integrationGate: "observability",
            lockedHint: "Connect Prometheus",
          },
        ],
      },
      {
        id: "operations",
        label: "Operations",
        defaultCollapsed: true,
        items: [
          { href: "/qa", label: "QA intelligence", icon: FlaskConical },
          { href: "/devops", label: "DevOps", icon: Server },
          { href: "/incidents", label: "Incidents", icon: AlertTriangle },
        ],
      },
      {
        id: "governance",
        label: "Governance",
        defaultCollapsed: true,
        items: [
          { href: "/recommendations", label: "Recommendations", icon: Lightbulb },
          { href: "/approvals", label: "Approval center", icon: CheckSquare },
          { href: "/governance", label: "Governance", icon: Shield },
        ],
      },
      {
        id: "platform",
        label: "Platform",
        defaultCollapsed: true,
        items: [
          { href: "/reports", label: "Reports", icon: BarChart3 },
          { href: "/audit", label: "Audit logs", icon: ScrollText },
          { href: "/agents", label: "Agents", icon: Bot },
          { href: "/agent-threads", label: "Agent threads", icon: MessagesSquare },
          { href: "/admin", label: "Admin", icon: Users },
        ],
      },
    ],
    bottomItems: [
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
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
): ResolvedEnterpriseNavLayout {
  const layout = getEnterpriseNavLayout();

  return {
    topItems: filterFlagEnabledItems(layout.topItems).map((item) => resolveNavItem(item, gates)),
    sections: layout.sections
      .map((section) => ({
        ...section,
        items: filterFlagEnabledItems(section.items).map((item) => resolveNavItem(item, gates)),
      }))
      .filter((section) => section.items.length > 0),
    bottomItems: filterFlagEnabledItems(layout.bottomItems).map((item) =>
      resolveNavItem(item, gates),
    ),
  };
}

/** Sidebar items after nav feature flags (flat list for MVP and legacy callers) */
export function getEnabledNavForMode(
  mode: WorkspaceMode,
  gates: IntegrationNavGates = DEFAULT_INTEGRATION_NAV_GATES,
): NavItem[] {
  if (mode === "MVP") {
    return getNavForMode(mode).filter((item) => isNavHrefEnabled(item.href));
  }

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
  if (mode === "MVP") {
    if (isNavHrefEnabled("/accelerator")) return WORKSPACE_META.MVP.homePath;
    return getEnabledHomePath("MVP");
  }
  if (!hasDna && isNavHrefEnabled("/governance")) return "/governance/setup";
  if (isNavHrefEnabled("/dashboard")) return "/dashboard";
  if (isNavHrefEnabled("/workflow")) return "/workflow";
  return getEnabledHomePath("ENTERPRISE");
}

export function isEnterpriseOnlyPath(pathname: string): boolean {
  const prefixes = [
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
    "/reports",
    "/audit",
    "/agents",
    "/agent-threads",
    "/admin",
  ];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isMvpOnlyPath(pathname: string): boolean {
  return pathname.startsWith("/accelerator");
}

export function isNavItemActive(pathname: string, href: string): boolean {
  return (
    pathname === href ||
    (href !== "/accelerator" && pathname.startsWith(`${href}/`)) ||
    (href === "/accelerator" &&
      pathname.startsWith("/accelerator") &&
      pathname !== "/accelerator/new")
  );
}
