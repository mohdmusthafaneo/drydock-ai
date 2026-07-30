"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import type { IntegrationNavGates } from "@/lib/nav-availability";
import { DEFAULT_INTEGRATION_NAV_GATES } from "@/lib/nav-availability";
import {
  getResolvedEnterpriseNavLayout,
  isNavItemActive,
  type NavItem,
  type ResolvedNavItem,
} from "@/lib/workspace-mode";
import { cn } from "@/lib/utils";

function findNavItem(
  layout: ReturnType<typeof getResolvedEnterpriseNavLayout>,
  href: string,
): ResolvedNavItem | undefined {
  const top = layout.topItems.find((item) => item.href === href);
  if (top) return top;
  const bottom = layout.bottomItems.find((item) => item.href === href);
  if (bottom) return bottom;
  return layout.sections
    .flatMap((section) => section.items)
    .find((item) => item.href === href);
}

function pickEnterpriseMobileItems(
  gates: IntegrationNavGates,
  userRole?: UserRole,
  options?: { activationMode?: boolean; hasDna?: boolean },
): ResolvedNavItem[] {
  const layout = getResolvedEnterpriseNavLayout(gates, userRole, options);
  const pinnedHrefs = options?.activationMode
    ? [
        options.hasDna ? "/dashboard" : "/activate",
        "/integrations",
        "/governance/setup",
        "/settings",
      ]
    : ["/dashboard", "/integrations", "/agent-threads", "/approvals"];
  const pinned = pinnedHrefs
    .map((href) => findNavItem(layout, href))
    .filter((item): item is ResolvedNavItem => Boolean(item));

  return pinned.slice(0, 4);
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
  const shortLabel =
    item.href === "/agent-threads"
      ? "Ask"
      : item.href === "/approvals"
        ? "Govern"
        : item.label.split(" ")[0];

  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
        active ? "font-medium text-ink" : "text-graphite",
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={steep ? 1.5 : 2} />
      <span className="max-w-[4rem] truncate">{shortLabel}</span>
    </Link>
  );
}

export function MobileNav({
  integrationGates = DEFAULT_INTEGRATION_NAV_GATES,
  userRole,
  activationMode = false,
  hasDna = false,
  steep = false,
}: {
  integrationGates?: IntegrationNavGates;
  userRole?: UserRole;
  activationMode?: boolean;
  hasDna?: boolean;
  steep?: boolean;
}) {
  const items = pickEnterpriseMobileItems(integrationGates, userRole, {
    activationMode,
    hasDna,
  });

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
