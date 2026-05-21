"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavForMode, type WorkspaceMode } from "@/lib/workspace-mode";
import { cn } from "@/lib/utils";

export function MobileNav({ workspaceMode }: { workspaceMode: WorkspaceMode }) {
  const pathname = usePathname();
  const isMvp = workspaceMode === "MVP";
  const items =
    workspaceMode === "ENTERPRISE"
      ? getNavForMode(workspaceMode).filter((i) =>
          ["/dashboard", "/workflow", "/observability", "/devops", "/incidents"].includes(
            i.href,
          ),
        )
      : getNavForMode(workspaceMode).slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href ||
          (item.href !== "/accelerator" && pathname.startsWith(`${item.href}/`)) ||
          (item.href === "/accelerator" &&
            pathname.startsWith("/accelerator") &&
            pathname !== "/accelerator/new");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
              active
                ? isMvp
                  ? "text-mvp"
                  : "text-brand"
                : "text-muted",
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="max-w-[4rem] truncate">{item.label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
