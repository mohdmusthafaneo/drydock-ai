"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";
import type { SessionPayload } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { IntegrationNavGates } from "@/lib/nav-availability";
import {
  WORKSPACE_META,
  getEnabledNavForMode,
  getResolvedEnterpriseNavLayout,
  isNavItemActive,
  type WorkspaceMode,
} from "@/lib/workspace-mode";
import { AidosLogo } from "@/components/brand/aidos-logo";
import { EnterpriseSidebarNav } from "@/components/layout/enterprise-sidebar-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ModeSwitcher } from "@/components/layout/mode-switcher";

function MvpSidebarNav() {
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
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[15px] transition-colors",
              active
                ? "bg-pure-white font-medium text-ink shadow-[0_0_0_1px_rgba(163,166,175,0.25)]"
                : "text-ash hover:bg-hover hover:text-ink",
              item.primary && !active && "font-medium text-ink",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {item.label}
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
  const meta = WORKSPACE_META[workspaceMode];
  const isMvp = workspaceMode === "MVP";
  const enterpriseLayout =
    workspaceMode === "ENTERPRISE"
      ? getResolvedEnterpriseNavLayout(integrationGates)
      : null;

  return (
    <div className="app-canvas flex min-h-screen bg-base text-primary">
      <aside className="hidden w-60 shrink-0 flex-col bg-fog lg:flex xl:w-[240px]">
        <div className="p-5 pb-4">
          <Link href={homePath} className="flex items-center gap-2.5">
            <AidosLogo size={32} />
            <div>
              <p className="text-[15px] font-medium tracking-tight text-ink">AIDOS</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {isMvp ? (
            <MvpSidebarNav />
          ) : enterpriseLayout ? (
            <EnterpriseSidebarNav layout={enterpriseLayout} isMvp={isMvp} steep />
          ) : null}
        </nav>

        <div className="space-y-3 border-t border-dove/40 p-4">
          <ModeSwitcher current={workspaceMode} compact />
          <div>
            <p className="truncate text-sm font-medium">{session.name}</p>
            <p className="truncate text-xs text-muted">{session.email}</p>
            <p className="mt-0.5 text-xs text-muted">{ROLE_LABELS[session.role]}</p>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-secondary hover:bg-hover hover:text-primary"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-dove/50 bg-pure-white px-4 lg:px-8">
          <p className="text-sm font-medium text-ink lg:hidden">{meta.label}</p>
        </header>
        <main className="w-full flex-1 bg-fog px-4 py-6 pb-24 lg:px-10 lg:py-10 lg:pb-8">
          <div className="mx-auto max-w-[1200px]">{children}</div>
        </main>
        <MobileNav workspaceMode={workspaceMode} integrationGates={integrationGates} steep />
      </div>
    </div>
  );
}
