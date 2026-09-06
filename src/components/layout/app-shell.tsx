"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";
import type { SessionPayload } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { IntegrationNavGates } from "@/lib/nav-availability";
import {
  WORKSPACE_META,
  getResolvedEnterpriseNavLayout,
  resolvePageTitleForPath,
} from "@/lib/workspace-mode";
import { AidosLogo } from "@/components/brand/aidos-logo";
import { EnterpriseSidebarNav } from "@/components/layout/enterprise-sidebar-nav";
import { MobileNav } from "@/components/layout/mobile-nav";

const SIDEBAR_STORAGE_KEY = "drydock-sidebar-collapsed";

function isChatPath(pathname: string): boolean {
  return pathname === "/agent-threads" || pathname.startsWith("/agent-threads/");
}

function isWizardPath(pathname: string): boolean {
  return (
    pathname === "/governance/setup" ||
    pathname.startsWith("/governance/setup/") ||
    pathname === "/activate" ||
    pathname.startsWith("/activate/")
  );
}

function HeaderTagline({ text }: { text: string }) {
  if (!text) return null;
  return (
    <span
      className={cn(
        "hidden shrink-0 items-center justify-end sm:inline-flex",
        "rounded-full border border-dove/40 bg-pure-white/80 px-3.5 py-1.5",
        "text-xs font-medium leading-none text-graphite shadow-[0_1px_2px_rgba(22,22,22,0.04)]",
      )}
    >
      <span className="whitespace-nowrap">{text}</span>
    </span>
  );
}

export function AppShell({
  session,
  integrationGates,
  homePath,
  activationMode = false,
  hasDna = false,
  children,
}: {
  session: SessionPayload;
  integrationGates?: IntegrationNavGates;
  homePath: string;
  activationMode?: boolean;
  hasDna?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const meta = WORKSPACE_META.ENTERPRISE;
  const enterpriseLayout = getResolvedEnterpriseNavLayout(integrationGates, session.role, {
    activationMode,
    hasDna,
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);

  const sidebarExpanded = !sidebarCollapsed || sidebarHovered;

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "true") setSidebarCollapsed(true);
  }, []);

  function setCollapsed(next: boolean) {
    setSidebarCollapsed(next);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
  }

  function handleMainInteract() {
    // no-op on desktop
  }
  const pageTitle = resolvePageTitleForPath(pathname, "ENTERPRISE", integrationGates);
  const chatMode = isChatPath(pathname);
  const hideMobileNav = isWizardPath(pathname);

  return (
    <div className="app-canvas flex h-dvh overflow-hidden bg-base text-primary">
      <aside
        onMouseEnter={() => sidebarCollapsed && setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        className={cn(
          "hidden h-full shrink-0 flex-col overflow-hidden border-r border-dove/40 bg-fog transition-[width,box-shadow] duration-200 lg:flex",
          sidebarExpanded ? "z-30 w-60 shadow-none xl:w-[240px]" : "w-[72px]",
          sidebarCollapsed && sidebarHovered && "shadow-[4px_0_24px_rgba(22,22,22,0.08)]",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 p-4",
            !sidebarExpanded && "justify-center px-2",
          )}
        >
          <Link
            href={homePath}
            className={cn("flex min-w-0 items-center gap-2.5", !sidebarExpanded && "justify-center")}
          >
            <AidosLogo size={32} />
            {sidebarExpanded && (
              <p className="truncate text-[15px] font-medium tracking-tight text-ink">DryDock</p>
            )}
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          <EnterpriseSidebarNav
            layout={enterpriseLayout}
            steep
            collapsed={!sidebarExpanded}
          />
        </nav>

        <div className="shrink-0 space-y-3 border-t border-dove/40 p-3">
          {sidebarExpanded && (
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
                !sidebarExpanded ? "justify-center px-2" : "px-3",
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {sidebarExpanded && "Sign out"}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-fog">
        {!chatMode ? (
          <header className="z-10 flex shrink-0 items-center justify-between gap-4 px-4 pt-5 pb-2 lg:px-10 lg:pt-8 lg:pb-3">
            <div className="min-w-0">
              <p className="truncate font-display text-[22px] leading-tight tracking-[-0.2px] text-ink lg:text-[26px] lg:tracking-[-0.28px]">
                {pageTitle}
              </p>
              <p className="mt-0.5 truncate text-xs text-graphite lg:hidden">{meta.label}</p>
            </div>
            <HeaderTagline text={meta.tagline} />
          </header>
        ) : null}
        <main
          className={cn(
            "min-h-0 w-full flex-1 overscroll-contain",
            chatMode
              ? "flex flex-col overflow-hidden px-0 pb-0 pt-0 lg:px-3 lg:pb-3 lg:pt-3"
              : hideMobileNav
                ? "overflow-y-auto px-4 pb-8 pt-2 lg:px-10 lg:pb-8 lg:pt-3"
                : "overflow-y-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-2 lg:px-10 lg:pb-8 lg:pt-3",
          )}
          onClick={handleMainInteract}
          onScroll={handleMainInteract}
        >
          <div
            className={cn(
              chatMode
                ? "relative flex min-h-0 flex-1 flex-col"
                : "mx-auto max-w-[1200px]",
            )}
          >
            {children}
          </div>
        </main>
        {!hideMobileNav ? (
          <MobileNav
            integrationGates={integrationGates}
            userRole={session.role}
            activationMode={activationMode}
            hasDna={hasDna}
            steep
          />
        ) : null}
      </div>
    </div>
  );
}
