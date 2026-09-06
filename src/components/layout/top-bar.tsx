"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronDown, LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS } from "@/lib/roles";
import type { SessionPayload } from "@/lib/session";
import { getSectionTabs, isNavItemActive } from "@/lib/workspace-mode";
import { cn } from "@/lib/utils";

export type TopBarSprint = {
  id: string;
  label: string;
  start: string;
  end: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function SectionTabs() {
  const pathname = usePathname();
  const tabs = getSectionTabs();

  return (
    <nav className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto" aria-label="Sections">
      {tabs.map((tab) => {
        const active = isNavItemActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative shrink-0 px-3 py-4 text-sm whitespace-nowrap transition-colors",
              active ? "font-medium text-ink" : "text-muted hover:text-secondary",
            )}
          >
            {tab.label}
            {active ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function DateRangeButton({
  dateRangeLabel,
  sprints = [],
}: {
  dateRangeLabel: string;
  sprints?: TopBarSprint[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectSprint(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sprint", id);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 max-w-[240px] items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-secondary hover:bg-hover"
        >
          <CalendarRange className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.5} />
          <span className="truncate">{dateRangeLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Sprint window</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sprints.length === 0 ? (
          <DropdownMenuItem disabled>{dateRangeLabel}</DropdownMenuItem>
        ) : (
          sprints.map((sprint) => (
            <DropdownMenuItem key={sprint.id} onSelect={() => selectSprint(sprint.id)}>
              <div className="min-w-0">
                <p className="truncate text-sm text-primary">{sprint.label}</p>
                <p className="truncate text-xs text-muted">
                  {sprint.start} – {sprint.end}
                </p>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ session }: { session: SessionPayload }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-hover"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-accent-soft text-xs font-medium text-accent">
              {initials(session.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 text-left lg:block">
            <span className="block truncate text-sm font-medium text-ink">{session.name}</span>
            <span className="block truncate text-xs text-muted">
              {ROLE_LABELS[session.role]}
            </span>
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-faint lg:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium text-ink">{session.name}</p>
          <p className="truncate text-xs text-muted">{ROLE_LABELS[session.role]}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" strokeWidth={1.5} />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action="/api/auth/logout" method="POST" className="w-full">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar({
  session,
  dateRangeLabel,
  sprints,
}: {
  session: SessionPayload;
  dateRangeLabel: string;
  sprints?: TopBarSprint[];
}) {
  return (
    <header
      data-slot="top-bar"
      className="z-10 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-pure-white px-4 lg:px-6"
    >
      <SectionTabs />
      <div className="flex shrink-0 items-center gap-2">
        <DateRangeButton dateRangeLabel={dateRangeLabel} sprints={sprints} />
        <UserMenu session={session} />
      </div>
    </header>
  );
}
