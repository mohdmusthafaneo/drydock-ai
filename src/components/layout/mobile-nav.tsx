"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { OverviewLink } from "@/components/overview/overview-link";
import { cn } from "@/lib/utils";

const MOBILE_PINS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/delivery-analysis", label: "Delivery", icon: Package },
  { href: "/qa", label: "QA", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
];

type MobileNavProps = {
  integrationGates?: unknown;
  userRole?: unknown;
  activationMode?: boolean;
  hasDna?: boolean;
  steep?: boolean;
};

export function MobileNav(_props?: MobileNavProps) {
  void _props;
  const pathname = usePathname();

  return (
    <nav
      data-slot="mobile-nav"
      className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-pure-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {MOBILE_PINS.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <OverviewLink
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
              active ? "font-medium text-ink" : "text-graphite",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.5} />
            <span className="max-w-[4rem] truncate">{item.label}</span>
          </OverviewLink>
        );
      })}
    </nav>
  );
}
