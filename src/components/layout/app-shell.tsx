"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CommandPalette } from "@/components/ui/command-palette";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar, type SidebarProject } from "@/components/layout/sidebar";
import { TopBar, type TopBarSprint } from "@/components/layout/top-bar";
import type { SessionPayload } from "@/lib/session";
import type { IntegrationNavGates } from "@/lib/nav-availability";
import { getSectionTabs } from "@/lib/workspace-mode";
import { cn } from "@/lib/utils";

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

/** Connexus content chrome: Overview density (1280px / pt-25 / px-6) for section destinations. */
function usesConnexusChrome(pathname: string): boolean {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return true;
  if (pathname === "/delivery-analysis" || pathname.startsWith("/delivery-analysis/")) return true;
  if (pathname === "/code-analysis" || pathname.startsWith("/code-analysis/")) return true;
  if (pathname === "/qa" || pathname.startsWith("/qa/")) return true;
  if (pathname === "/governance" || pathname.startsWith("/governance/")) return true;
  if (pathname === "/approvals" || pathname.startsWith("/approvals/")) return true;
  if (pathname === "/attention" || pathname.startsWith("/attention/")) return true;
  if (pathname === "/risk" || pathname.startsWith("/risk/")) return true;
  if (pathname === "/reports" || pathname.startsWith("/reports/")) return true;
  if (pathname === "/integrations" || pathname.startsWith("/integrations/")) return true;
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return true;
  return false;
}

export function AppShell({
  session,
  integrationGates,
  homePath,
  organizationName,
  projects = [],
  lastSyncAt = null,
  activeSprintLabel,
  sprints = [],
  activationMode = false,
  hasDna = false,
  children,
}: {
  session: SessionPayload;
  integrationGates?: IntegrationNavGates;
  homePath: string;
  organizationName: string;
  projects?: SidebarProject[];
  lastSyncAt?: string | null;
  activeSprintLabel?: string;
  sprints?: TopBarSprint[];
  activationMode?: boolean;
  hasDna?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTeam = searchParams.get("team");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const chatMode = isChatPath(pathname);
  const hideMobileNav = isWizardPath(pathname);
  const overviewMode = usesConnexusChrome(pathname);

  const destinations = useMemo(() => getSectionTabs(), []);
  const dateRangeLabel =
    activeSprintLabel ??
    sprints[0]?.label ??
    "Current sprint";

  const onSelectWorkspace = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("team", key);
      const qs = params.toString();
      const base = pathname.startsWith("/dashboard") ? "/dashboard" : "/dashboard";
      router.push(qs ? `${base}?${qs}` : base);
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="app-canvas flex h-dvh overflow-hidden bg-base text-primary">
      <Sidebar
        organizationName={organizationName}
        homePath={homePath}
        projects={projects}
        lastSyncAt={lastSyncAt}
        activeTeam={activeTeam}
        onOpenCommandPalette={() => setPaletteOpen(true)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-base">
        {!chatMode ? (
          <TopBar
            session={session}
            dateRangeLabel={dateRangeLabel}
            sprints={sprints}
          />
        ) : null}
        <main
          className={cn(
            "min-h-0 w-full flex-1 overscroll-contain bg-base",
            chatMode
              ? "flex flex-col overflow-hidden px-0 pb-0 pt-0 lg:px-3 lg:pb-3 lg:pt-3"
              : hideMobileNav
                ? "overflow-y-auto px-4 pb-8 pt-4 lg:px-6 lg:pb-7 lg:pt-[25px]"
                : overviewMode
                  ? "overflow-y-auto px-6 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[25px] lg:px-6 lg:pb-7"
                  : "overflow-y-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 lg:px-8 lg:pb-8 lg:pt-5",
          )}
        >
          <div
            className={cn(
              chatMode
                ? "relative flex min-h-0 flex-1 flex-col"
                : overviewMode
                  ? "mx-auto w-full max-w-[min(1280px,calc(100%-0px))]"
                  : "mx-auto w-full max-w-[1200px]",
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
          />
        ) : null}
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        destinations={destinations}
        workspaces={projects}
        onSelectWorkspace={onSelectWorkspace}
      />
    </div>
  );
}
