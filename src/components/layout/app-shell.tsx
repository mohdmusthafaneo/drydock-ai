"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";
import type { SessionPayload } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { IntegrationNavGates } from "@/lib/nav-availability";
import {
  WORKSPACE_META,
  getEnabledNavForMode,
  getResolvedEnterpriseNavLayout,
  isNavItemActive,
  resolvePageTitleForPath,
  type WorkspaceMode,
} from "@/lib/workspace-mode";
import { AidosLogo } from "@/components/brand/aidos-logo";
import { EnterpriseSidebarNav } from "@/components/layout/enterprise-sidebar-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ModeSwitcher } from "@/components/layout/mode-switcher";

const SIDEBAR_STORAGE_KEY = "aidos-sidebar-collapsed";

function MvpSidebarNav({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const items = getEnabledNavForMode("MVP");

  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl py-2.5 text-[15px] transition-colors",
              collapsed ? "justify-center px-2" : "px-3",
              active
                ? "bg-pure-white font-medium text-ink shadow-[0_0_0_1px_rgba(163,166,175,0.25)]"
                : "text-ash hover:bg-hover hover:text-ink",
              item.primary && !active && "font-medium text-ink",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function AppShell({
  session,
  workspaceMode,
  integrationGates,
  homePath,
  children,
}: {
  session: SessionPayload;
  workspaceMode: WorkspaceMode;
  integrationGates?: IntegrationNavGates;
  homePath: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const meta = WORKSPACE_META[workspaceMode];
  const isMvp = workspaceMode === "MVP";
  const enterpriseLayout =
    workspaceMode === "ENTERPRISE"
      ? getResolvedEnterpriseNavLayout(integrationGates)
      : null;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "true") setSidebarCollapsed(true);
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  const pageTitle = resolvePageTitleForPath(pathname, workspaceMode, integrationGates);

  return (
    <div className="app-canvas flex h-dvh overflow-hidden bg-base text-primary">
      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col overflow-hidden border-r border-dove/40 bg-fog transition-[width] duration-200 lg:flex",
          sidebarCollapsed ? "w-[72px]" : "w-60 xl:w-[240px]",
        )}
      >
        <div className={cn("flex shrink-0 items-center gap-2 p-4", sidebarCollapsed && "justify-center px-2")}>
          <Link
            href={homePath}
            className={cn("flex min-w-0 items-center gap-2.5", sidebarCollapsed && "justify-center")}
          >
            <AidosLogo size={32} />
            {!sidebarCollapsed && (
              <p className="truncate text-[15px] font-medium tracking-tight text-ink">AIDOS</p>
            )}
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {isMvp ? (
            <MvpSidebarNav collapsed={sidebarCollapsed} />
          ) : enterpriseLayout ? (
            <EnterpriseSidebarNav
              layout={enterpriseLayout}
              isMvp={isMvp}
              steep
              collapsed={sidebarCollapsed}
            />
          ) : null}
        </nav>

        <div className="shrink-0 space-y-3 border-t border-dove/40 p-3">
          {!sidebarCollapsed && <ModeSwitcher current={workspaceMode} compact />}
          {!sidebarCollapsed && (
            <div>
              <p className="truncate text-sm font-medium">{session.name}</p>
              <p className="truncate text-xs text-muted">{session.email}</p>
              <p className="mt-0.5 text-xs text-muted">{ROLE_LABELS[session.role]}</p>
            </div>
          )}
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              title="Sign out"
              className={cn(
                "flex w-full items-center gap-2 rounded-xl py-2 text-sm text-secondary hover:bg-hover hover:text-primary",
                sidebarCollapsed ? "justify-center px-2" : "px-3",
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {!sidebarCollapsed && "Sign out"}
            </button>
          </form>
          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl py-2 text-sm text-graphite hover:bg-hover hover:text-ink",
              sidebarCollapsed ? "justify-center px-2" : "px-3",
            )}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                Collapse
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-dove/50 bg-pure-white px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden rounded-lg p-2 text-graphite hover:bg-hover hover:text-ink lg:inline-flex"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" strokeWidth={1.5} />
              ) : (
                <PanelLeftClose className="h-5 w-5" strokeWidth={1.5} />
              )}
            </button>
            <div className="min-w-0">
              <p className="truncate font-display text-[18px] leading-tight tracking-[-0.14px] text-ink lg:text-[22px] lg:tracking-[-0.2px]">
                {pageTitle}
              </p>
              <p className="truncate text-xs text-graphite lg:hidden">{meta.label}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden rounded-full bg-fog px-3 py-1 text-xs text-ash sm:inline">
              {meta.tagline}
            </span>
            <p className="hidden max-w-[10rem] truncate text-sm text-graphite md:block">
              {session.name}
            </p>
          </div>
        </header>
        <main className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain bg-fog px-4 py-6 pb-24 lg:px-10 lg:py-10 lg:pb-8">
          <div className="mx-auto max-w-[1200px]">{children}</div>
        </main>
        <MobileNav workspaceMode={workspaceMode} integrationGates={integrationGates} steep />
      </div>
    </div>
  );
}
