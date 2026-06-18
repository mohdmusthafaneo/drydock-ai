"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IntegrationNavGates } from "@/lib/nav-availability";
import { DEFAULT_INTEGRATION_NAV_GATES } from "@/lib/nav-availability";
import {
  getResolvedEnterpriseNavLayout,
  isNavItemActive,
  type NavItem,
  type ResolvedNavItem,
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
  steep = false,
}: {
  item: NavItem | ResolvedNavItem;
  href: string;
  steep?: boolean;
}) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active = isNavItemActive(pathname, item.href);

  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
        active ? "font-medium text-ink" : "text-graphite",
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={steep ? 1.5 : 2} />
      <span className="max-w-[4rem] truncate">{item.label.split(" ")[0]}</span>
    </Link>
  );
}

export function MobileNav({
  integrationGates = DEFAULT_INTEGRATION_NAV_GATES,
  steep = false,
}: {
  integrationGates?: IntegrationNavGates;
  steep?: boolean;
}) {
  const items = pickEnterpriseMobileItems(integrationGates);

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 flex border-t pb-[env(safe-area-inset-bottom)] lg:hidden",
        steep ? "border-dove/50 bg-pure-white" : "border-border bg-sidebar",
      )}
    >
      {items.map((item) => (
        <MobileNavLink
          key={item.href}
          item={item}
          href={item.resolvedHref}
          steep={steep}
        />
      ))}
    </nav>
  );
}
