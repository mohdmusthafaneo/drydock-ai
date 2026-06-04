import type { LucideIcon } from "lucide-react";
import { isNavHrefEnabled } from "@/lib/feature-flags";
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

  return [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true },
    { href: "/workflow", label: "Workflow center", icon: GitBranch },
    { href: "/delivery-analysis", label: "Delivery analysis", icon: Kanban },
    { href: "/qa", label: "QA intelligence", icon: FlaskConical },
    { href: "/code-analysis", label: "Code analysis", icon: Code2 },
    { href: "/observability", label: "Observability", icon: Activity },
    { href: "/devops", label: "DevOps", icon: Server },
    { href: "/incidents", label: "Incidents", icon: AlertTriangle },
    { href: "/recommendations", label: "Recommendations", icon: Lightbulb },
    { href: "/approvals", label: "Approval center", icon: CheckSquare },
    { href: "/governance", label: "Governance", icon: Shield },
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/audit", label: "Audit logs", icon: ScrollText },
    { href: "/agents", label: "Agents", icon: Bot },
    { href: "/integrations", label: "Integrations", icon: Plug },
    { href: "/admin", label: "Admin", icon: Users },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
}

/** Sidebar items after nav feature flags */
export function getEnabledNavForMode(mode: WorkspaceMode): NavItem[] {
  return getNavForMode(mode).filter((item) => isNavHrefEnabled(item.href));
}

export function getEnabledHomePath(mode: WorkspaceMode): string {
  const nav = getEnabledNavForMode(mode);
  const primary = nav.find((item) => item.primary);
  if (primary) return primary.href;
  if (nav.length > 0) return nav[0].href;
  return "/integrations";
}

export function getHomePath(mode: WorkspaceMode, hasDna: boolean): string {
  if (mode === "MVP") {
    if (isNavHrefEnabled("/accelerator")) return WORKSPACE_META.MVP.homePath;
    return getEnabledHomePath("MVP");
  }
  if (isNavHrefEnabled("/dashboard")) {
    return hasDna ? WORKSPACE_META.ENTERPRISE.homePath : "/governance/setup";
  }
  if (!hasDna && isNavHrefEnabled("/governance")) return "/governance/setup";
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
    "/admin",
  ];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isMvpOnlyPath(pathname: string): boolean {
  return pathname.startsWith("/accelerator");
}
