"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IntegrationNavGates } from "@/lib/nav-availability";
import { DEFAULT_INTEGRATION_NAV_GATES } from "@/lib/nav-availability";
import {
  getEnabledNavForMode,
  getResolvedEnterpriseNavLayout,
  isNavItemActive,
  type NavItem,
  type ResolvedNavItem,
  type WorkspaceMode,
} from "@/lib/workspace-mode";
import { cn } from "@/lib/utils";

function pickEnterpriseMobileItems(
  gates: IntegrationNavGates,
): ResolvedNavItem[] {
  const layout = getResolvedEnterpriseNavLayout(gates);
  const pinnedHrefs = ["/workflow", "/dashboard", "/integrations", "/settings"];
  const pinned = pinnedHrefs
    .map((href) => {
      const top = layout.topItems.find((item) => item.href === href);
      if (top) return top;
      return layout.bottomItems.find((item) => item.href === href);
    })
    .filter((item): item is ResolvedNavItem => Boolean(item));

  const unlockedAnalysis = layout.sections
    .flatMap((section) => section.items)
    .find((item) => item.integrationGate && !item.locked);

  const items = unlockedAnalysis ? [...pinned.slice(0, 4), unlockedAnalysis] : pinned;
  return items.slice(0, 5);
}

function MobileNavLink({
  item,
  href,
  isMvp,
}: {
  item: NavItem | ResolvedNavItem;
  href: string;
  isMvp: boolean;
}) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active = isNavItemActive(pathname, item.href);

  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
        active ? (isMvp ? "text-mvp" : "text-brand") : "text-muted",
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="max-w-[4rem] truncate">{item.label.split(" ")[0]}</span>
    </Link>
  );
}

export function MobileNav({
  workspaceMode,
  integrationGates = DEFAULT_INTEGRATION_NAV_GATES,
}: {
  workspaceMode: WorkspaceMode;
  integrationGates?: IntegrationNavGates;
}) {
  const isMvp = workspaceMode === "MVP";

  if (workspaceMode === "ENTERPRISE") {
    const items = pickEnterpriseMobileItems(integrationGates);
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden">
        {items.map((item) => (
          <MobileNavLink key={item.href} item={item} href={item.resolvedHref} isMvp={isMvp} />
        ))}
      </nav>
    );
  }

  const items = getEnabledNavForMode(workspaceMode).slice(0, 5);
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((item) => (
        <MobileNavLink key={item.href} item={item} href={item.href} isMvp={isMvp} />
      ))}
    </nav>
  );
}
