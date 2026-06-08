"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import {
  isNavItemActive,
  type ResolvedEnterpriseNavLayout,
  type ResolvedNavItem,
} from "@/lib/workspace-mode";
import { cn } from "@/lib/utils";

function NavLink({
  item,
  isMvp,
}: {
  item: ResolvedNavItem;
  isMvp: boolean;
}) {
  const pathname = usePathname();
  const active = !item.locked && isNavItemActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.resolvedHref}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors",
        item.locked && "cursor-default opacity-60 hover:bg-hover/50",
        active
          ? isMvp
            ? "bg-mvp-muted text-mvp"
            : "bg-enterprise-muted text-enterprise"
          : !item.locked && "text-secondary hover:bg-hover hover:text-primary",
        item.primary && !active && !item.locked && "font-medium text-primary",
      )}
      title={item.locked ? item.lockedHint : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.locked && (
        <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted">
          <Lock className="h-3 w-3" />
          <span className="hidden xl:inline">{item.lockedHint}</span>
        </span>
      )}
    </Link>
  );
}

function NavSectionBlock({
  section,
  isMvp,
}: {
  section: ResolvedEnterpriseNavLayout["sections"][number];
  isMvp: boolean;
}) {
  const pathname = usePathname();
  const sectionActive = section.items.some((item) => isNavItemActive(pathname, item.href));
  const [collapsed, setCollapsed] = useState(
    section.defaultCollapsed && !sectionActive,
  );

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={() => setCollapsed((open) => !open)}
        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted transition-colors hover:text-secondary"
        aria-expanded={!collapsed}
      >
        <span>{section.label}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")}
        />
      </button>
      {!collapsed && (
        <div className="mt-0.5 space-y-0.5">
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} isMvp={isMvp} />
          ))}
        </div>
      )}
    </div>
  );
}

export function EnterpriseSidebarNav({
  layout,
  isMvp,
}: {
  layout: ResolvedEnterpriseNavLayout;
  isMvp: boolean;
}) {
  return (
    <>
      <div className="space-y-0.5">
        {layout.topItems.map((item) => (
          <NavLink key={item.href} item={item} isMvp={isMvp} />
        ))}
      </div>

      {layout.sections.map((section) => (
        <NavSectionBlock key={section.id} section={section} isMvp={isMvp} />
      ))}

      {layout.bottomItems.length > 0 && (
        <div className="mt-3 space-y-0.5 border-t border-border pt-3">
          {layout.bottomItems.map((item) => (
            <NavLink key={item.href} item={item} isMvp={isMvp} />
          ))}
        </div>
      )}
    </>
  );
}
