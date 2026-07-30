"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import {
  isNavItemActive,
  type ResolvedEnterpriseNavLayout,
  type ResolvedNavItem,
  type ResolvedNavSection,
} from "@/lib/workspace-mode";
import { cn } from "@/lib/utils";

function resolveSectionHref(section: ResolvedNavSection, pathname: string): string {
  const activeItem = section.items.find(
    (item) => !item.locked && isNavItemActive(pathname, item.href),
  );
  if (activeItem) return activeItem.resolvedHref;

  const firstUnlocked = section.items.find((item) => !item.locked);
  if (firstUnlocked) return firstUnlocked.resolvedHref;

  return section.items[0]?.resolvedHref ?? "/integrations";
}

function NavLink({
  item,
  steep = false,
  collapsed = false,
}: {
  item: ResolvedNavItem;
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

function CollapsedSectionLink({
  section,
  steep = false,
}: {
  section: ResolvedNavSection;
  steep?: boolean;
}) {
  const pathname = usePathname();
  const sectionActive = section.items.some((item) => isNavItemActive(pathname, item.href));
  const Icon = section.icon;
  const href = resolveSectionHref(section, pathname);

  return (
    <Link
      href={href}
      title={section.label}
      className={cn(
        "flex items-center justify-center rounded-xl px-2 py-2.5 transition-colors",
        sectionActive
          ? "bg-pure-white font-medium text-ink shadow-[0_0_0_1px_rgba(163,166,175,0.25)]"
          : "text-ash hover:bg-hover hover:text-ink",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={steep ? 1.5 : 2} />
    </Link>
  );
}

function NavSectionBlock({
  section,
  steep = false,
  collapsed = false,
}: {
  section: ResolvedNavSection;
  steep?: boolean;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const sectionActive = section.items.some((item) => isNavItemActive(pathname, item.href));
  // Seed from defaultCollapsed only (no pathname) so SSR and first client paint match.
  const [collapsedSection, setCollapsedSection] = useState(() =>
    Boolean(section.defaultCollapsed),
  );

  useEffect(() => {
    setCollapsedSection(Boolean(section.defaultCollapsed) && !sectionActive);
  }, [section.defaultCollapsed, sectionActive]);

  if (collapsed) {
    return <CollapsedSectionLink section={section} steep={steep} />;
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
            <NavLink key={item.href} item={item} steep={steep} />
          ))}
        </div>
      )}
    </div>
  );
}

export function EnterpriseSidebarNav({
  layout,
  steep = false,
  collapsed = false,
}: {
  layout: ResolvedEnterpriseNavLayout;
  steep?: boolean;
  collapsed?: boolean;
}) {
  return (
    <>
      <div className="space-y-0.5">
        {layout.topItems.map((item) => (
          <NavLink key={item.href} item={item} steep={steep} collapsed={collapsed} />
        ))}
      </div>

      <div className={cn(collapsed ? "mt-2 space-y-1" : undefined)}>
        {layout.sections.map((section) => (
          <NavSectionBlock
            key={section.id}
            section={section}
            steep={steep}
            collapsed={collapsed}
          />
        ))}
      </div>

      {layout.bottomItems.length > 0 && (
        <div
          className={cn(
            "mt-3 space-y-0.5 pt-3",
            steep ? "border-t border-dove/40" : "border-t border-border",
          )}
        >
          {layout.bottomItems.map((item) => (
            <NavLink key={item.href} item={item} steep={steep} collapsed={collapsed} />
          ))}
        </div>
      )}
    </>
  );
}
