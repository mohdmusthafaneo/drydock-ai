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
  steep = false,
  collapsed = false,
}: {
  item: ResolvedNavItem;
  isMvp: boolean;
  steep?: boolean;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active = !item.locked && isNavItemActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.resolvedHref}
      title={collapsed ? item.label : item.locked ? item.lockedHint : undefined}
      className={cn(
        "flex items-center gap-2.5 py-2.5 text-[15px] transition-colors",
        steep ? "rounded-xl" : "rounded-lg text-sm",
        collapsed ? "justify-center px-2" : "px-3",
        item.locked && "cursor-default opacity-60 hover:bg-hover/50",
        active
          ? steep
            ? "bg-pure-white font-medium text-ink shadow-[0_0_0_1px_rgba(163,166,175,0.25)]"
            : isMvp
              ? "bg-mvp-muted text-mvp"
              : "bg-enterprise-muted text-enterprise"
          : !item.locked &&
              (steep
                ? "text-ash hover:bg-hover hover:text-ink"
                : "text-secondary hover:bg-hover hover:text-primary"),
        item.primary && !active && !item.locked && (steep ? "font-medium text-ink" : "font-medium text-primary"),
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={steep ? 1.5 : 2} />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.locked && (
            <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted">
              <Lock className="h-3 w-3" />
              <span className="hidden xl:inline">{item.lockedHint}</span>
            </span>
          )}
        </>
      )}
    </Link>
  );
}

function NavSectionBlock({
  section,
  isMvp,
  steep = false,
  collapsed = false,
}: {
  section: ResolvedEnterpriseNavLayout["sections"][number];
  isMvp: boolean;
  steep?: boolean;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const sectionActive = section.items.some((item) => isNavItemActive(pathname, item.href));
  const [collapsedSection, setCollapsedSection] = useState(
    section.defaultCollapsed && !sectionActive,
  );

  if (collapsed) {
    return (
      <div className="space-y-0.5 pt-1">
        {section.items.map((item) => (
          <NavLink key={item.href} item={item} isMvp={isMvp} steep={steep} collapsed />
        ))}
      </div>
    );
  }

  return (
    <div className="pt-3">
      <button
        type="button"
        onClick={() => setCollapsedSection((open) => !open)}
        className={cn(
          "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left transition-colors",
          steep
            ? "text-[13px] font-medium uppercase tracking-[0.04em] text-graphite hover:text-ash"
            : "text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-secondary",
        )}
        aria-expanded={!collapsedSection}
      >
        <span>{section.label}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", collapsedSection && "-rotate-90")}
        />
      </button>
      {!collapsedSection && (
        <div className="mt-0.5 space-y-0.5">
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} isMvp={isMvp} steep={steep} />
          ))}
        </div>
      )}
    </div>
  );
}

export function EnterpriseSidebarNav({
  layout,
  isMvp,
  steep = false,
  collapsed = false,
}: {
  layout: ResolvedEnterpriseNavLayout;
  isMvp: boolean;
  steep?: boolean;
  collapsed?: boolean;
}) {
  return (
    <>
      <div className="space-y-0.5">
        {layout.topItems.map((item) => (
          <NavLink key={item.href} item={item} isMvp={isMvp} steep={steep} collapsed={collapsed} />
        ))}
      </div>

      {layout.sections.map((section) => (
        <NavSectionBlock
          key={section.id}
          section={section}
          isMvp={isMvp}
          steep={steep}
          collapsed={collapsed}
        />
      ))}

      {layout.bottomItems.length > 0 && (
        <div
          className={cn(
            "mt-3 space-y-0.5 pt-3",
            steep ? "border-t border-dove/40" : "border-t border-border",
          )}
        >
          {layout.bottomItems.map((item) => (
            <NavLink key={item.href} item={item} isMvp={isMvp} steep={steep} collapsed={collapsed} />
          ))}
        </div>
      )}
    </>
  );
}
