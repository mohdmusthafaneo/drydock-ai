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

function formatExplicitRange(sprint: TopBarSprint): string {
  const start = new Date(`${sprint.start}T12:00:00`);
  const end = new Date(`${sprint.end}T12:00:00`);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
}

function SectionTabs() {
  const pathname = usePathname();
  const tabs = getSectionTabs();

  return (
    <nav
      className="flex min-w-0 flex-1 items-stretch gap-[29px] overflow-x-auto"
      aria-label="Sections"
    >
      {tabs.map((tab) => {
        const active = isNavItemActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative flex shrink-0 items-center text-[14px] whitespace-nowrap transition-colors",
              active
                ? "font-semibold text-brown-text"
                : "text-[#65728a] hover:text-secondary",
            )}
          >
            {tab.label}
            {active ? (
              <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-t-[3px] bg-brown-underline" />
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
  const selectedId = searchParams.get("sprint");
  const selected =
    sprints.find((s) => s.id === selectedId) ?? sprints[0] ?? null;
  const displayLabel = selected ? formatExplicitRange(selected) : dateRangeLabel;

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
          className="inline-flex h-9 max-w-[280px] items-center gap-2 rounded-[9px] border border-border bg-pure-white px-[11px] text-[12px] text-[#64748b] hover:bg-hover"
        >
          <CalendarRange className="h-4 w-4 shrink-0" strokeWidth={1.7} />
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="ml-[5px] h-3.5 w-3.5 shrink-0" />
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
                  {formatExplicitRange(sprint)}
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
          <Avatar className="size-[38px]">
            <AvatarFallback className="bg-[#e9edf1] text-[12px] font-bold text-[#182230]">
              {initials(session.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 text-left lg:block">
            <span className="block truncate text-[12px] font-semibold text-ink">
              {session.name}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-muted">
              {ROLE_LABELS[session.role]}
            </span>
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-[#475467] lg:block" />
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
      className="z-10 flex h-[54px] shrink-0 items-stretch justify-between border-b border-border-soft bg-[rgba(255,255,255,0.8)] pr-6 pl-[34px]"
    >
      <SectionTabs />
      <div className="flex shrink-0 items-center gap-[11px]">
        <DateRangeButton dateRangeLabel={dateRangeLabel} sprints={sprints} />
        <UserMenu session={session} />
      </div>
    </header>
  );
}
