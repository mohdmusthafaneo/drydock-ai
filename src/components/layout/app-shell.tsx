"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";
import type { SessionPayload } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  WORKSPACE_META,
  getEnabledHomePath,
  getEnabledNavForMode,
  type WorkspaceMode,
} from "@/lib/workspace-mode";
import { AidosLogo } from "@/components/brand/aidos-logo";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ModeSwitcher } from "@/components/layout/mode-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AppShell({
  session,
  workspaceMode,
  children,
}: {
  session: SessionPayload;
  workspaceMode: WorkspaceMode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const meta = WORKSPACE_META[workspaceMode];
  const homePath = getEnabledHomePath(workspaceMode);
  const nav = getEnabledNavForMode(workspaceMode);
  const isMvp = workspaceMode === "MVP";

  return (
    <div className="app-canvas flex min-h-screen bg-base text-primary">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex xl:w-64">
        <div className="border-b border-border p-5">
          <Link href={homePath} className="flex items-center gap-2.5">
            <AidosLogo size={36} />
            <div>
              <p className="font-semibold tracking-tight">AIDOS</p>
              <p className="text-[11px] text-muted">{meta.label}</p>
            </div>
          </Link>
          <p className="mt-3 text-xs leading-relaxed text-muted">{meta.description}</p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {nav.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/accelerator" &&
                pathname.startsWith(`${item.href}/`)) ||
              (item.href === "/accelerator" &&
                pathname.startsWith("/accelerator") &&
                pathname !== "/accelerator/new");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? isMvp
                      ? "bg-mvp-muted text-mvp"
                      : "bg-enterprise-muted text-enterprise"
                    : "text-secondary hover:bg-hover hover:text-primary",
                  item.primary && !active && "font-medium text-primary",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-border p-4">
          <ModeSwitcher current={workspaceMode} compact />
          <div>
            <p className="truncate text-sm font-medium">{session.name}</p>
            <p className="truncate text-xs text-muted">{session.email}</p>
            <p className="mt-0.5 text-xs text-muted">{ROLE_LABELS[session.role]}</p>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-secondary hover:bg-hover hover:text-primary"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-sidebar/80 px-4 py-3 backdrop-blur-md lg:px-8">
          <p className="text-sm font-semibold lg:hidden">{meta.label}</p>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                "hidden rounded-full px-3 py-1 text-xs sm:inline",
                isMvp ? "bg-mvp-muted text-mvp" : "bg-brand-muted text-brand",
              )}
            >
              {meta.tagline}
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main className="w-full flex-1 p-4 pb-24 lg:px-8 lg:py-8 lg:pb-8 xl:px-10 2xl:px-12">
          {children}
        </main>
        <MobileNav workspaceMode={workspaceMode} />
      </div>
    </div>
  );
}
