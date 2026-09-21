"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavHrefEnabled } from "@/lib/feature-flags";
import { getEnterpriseNavLayout, isNavItemActive } from "@/lib/workspace-mode";
import { cn } from "@/lib/utils";

/**
 * Destination routes for the quick-links destinations only.
 * Settings / Overview / etc. are intentionally excluded.
 */
const OPS_NAV_PATH_PREFIXES = [
  "/briefing",
  "/ledger",
  "/standard",
  "/certificate",
  "/escapes",
  "/releases",
  "/integrations",
  "/audit",
] as const;

export function isOpsQuickNavPath(pathname: string): boolean {
  return OPS_NAV_PATH_PREFIXES.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

/** Floating bottom bar for switching between operational destinations. */
export function OpsQuickNav() {
  const pathname = usePathname();
  const layout = getEnterpriseNavLayout();
  const items = [
    ...layout.topItems,
    ...layout.bottomItems.filter((item) => item.href === "/audit"),
  ].filter((item) => isNavHrefEnabled(item.href));

  if (items.length === 0) return null;

  return (
    <div
      data-slot="ops-quick-nav-host"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
    >
      <nav
        data-slot="ops-quick-nav"
        aria-label="Operational shortcuts"
        className="pointer-events-auto max-w-[calc(100%-0.5rem)] overflow-hidden rounded-[14px] border border-border bg-pure-white shadow-[0_8px_28px_rgba(16,24,40,0.12)]"
      >
        <ul className="flex items-stretch gap-0.5 overflow-x-auto overscroll-x-contain px-1.5 py-1.5 sm:gap-1 sm:px-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(pathname, item.href);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-9 items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[12px] whitespace-nowrap transition-colors sm:px-3 sm:text-[13px]",
                    active
                      ? "bg-brown-soft font-semibold text-brown"
                      : "text-[#5d6a80] hover:bg-[#f6f7f8] hover:text-ink",
                  )}
                >
                  <Icon
                    className={cn("h-3.5 w-3.5 shrink-0", active ? "text-brown" : "text-muted")}
                    strokeWidth={1.7}
                    aria-hidden
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
