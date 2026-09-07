"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Database,
  Globe,
  LayoutGrid,
  Plug,
  Search,
  Server,
  Settings,
  Smartphone,
  Users,
} from "lucide-react";
import { OrgMark } from "@/components/brand/org-mark";
import { formatDistanceToNow } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const PROJECT_ICONS = [Globe, Smartphone, Database, Server, LayoutGrid] as const;

export type SidebarProject = {
  key: string;
  name: string;
};

export function Sidebar({
  organizationName,
  homePath,
  projects,
  lastSyncAt,
  activeTeam,
  onOpenCommandPalette,
}: {
  organizationName: string;
  homePath: string;
  projects: SidebarProject[];
  lastSyncAt: string | null;
  activeTeam: string | null;
  onOpenCommandPalette: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const syncRelative = lastSyncAt
    ? formatDistanceToNow(new Date(lastSyncAt))
    : null;

  function setTeam(team: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (team) params.set("team", team);
    else params.delete("team");
    const qs = params.toString();
    const base = pathname.startsWith("/dashboard") ? "/dashboard" : pathname;
    router.push(qs ? `${base}?${qs}` : base);
  }

  const navItemClass = (active: boolean) =>
    cn(
      "relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm",
      active
        ? "bg-brown-soft font-semibold text-brown"
        : "text-[#5d6a80] hover:bg-[#f6f7f8] hover:text-ink",
    );

  return (
    <aside
      data-slot="sidebar"
      className="hidden h-full w-[206px] shrink-0 flex-col border-r border-border-soft bg-[rgba(255,255,255,0.72)] lg:flex"
    >
      <div className="flex shrink-0 flex-col px-3.5 pt-[18px]">
        <Link href={homePath} className="mb-[21px] flex min-w-0 items-center gap-2.5 px-2.5">
          <OrgMark size={25} />
          <span className="truncate text-[18px] font-bold tracking-[-0.35px] text-ink">
            {organizationName}
          </span>
        </Link>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="mb-[25px] flex h-10 w-full items-center gap-[9px] rounded-[10px] border border-border bg-pure-white px-[11px] text-left text-sm text-muted hover:bg-hover"
        >
          <Search className="h-[17px] w-[17px] shrink-0" strokeWidth={1.7} />
          <span className="flex-1 truncate">Search...</span>
          <kbd className="rounded-[5px] bg-[#f7f8f9] px-[5px] py-0.5 text-[11px] text-[#9aa2ae]">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-3">
        <p className="px-2.5 pb-2 text-[10px] tracking-[0.08em] text-[#7f8a9c] uppercase">
          Workspace
        </p>
        <ul className="grid gap-[3px]">
          <li>
            <button
              type="button"
              onClick={() => setTeam(null)}
              className={navItemClass(!activeTeam)}
            >
              {!activeTeam ? (
                <span className="absolute top-[5px] bottom-[5px] left-0 w-[3px] rounded-[3px] bg-accent" />
              ) : null}
              <Users
                className={cn("h-4 w-4 shrink-0", !activeTeam ? "text-brown" : "text-muted")}
                strokeWidth={1.7}
              />
              All teams
            </button>
          </li>
          {projects.map((project, index) => {
            const Icon = PROJECT_ICONS[index % PROJECT_ICONS.length]!;
            const active = activeTeam === project.key;
            return (
              <li key={project.key}>
                <button
                  type="button"
                  onClick={() => setTeam(project.key)}
                  className={navItemClass(active)}
                >
                  {active ? (
                    <span className="absolute top-[5px] bottom-[5px] left-0 w-[3px] rounded-[3px] bg-accent" />
                  ) : null}
                  <Icon
                    className={cn("h-4 w-4 shrink-0", active ? "text-brown" : "text-muted")}
                    strokeWidth={1.7}
                  />
                  <span className="truncate">{project.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto shrink-0 space-y-1 px-3.5 pb-4">
        <div className="mb-[15px] flex items-start gap-2.5 rounded-[11px] border border-border bg-pure-white px-3.5 py-[13px]">
          <span
            className={cn(
              "mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_3px_#e9f8f0]",
              lastSyncAt ? "bg-green" : "bg-faint shadow-none",
            )}
          />
          <div className="min-w-0">
            <strong className="block text-[12px] font-semibold text-ink">
              {lastSyncAt ? "Data synced" : "Never synced"}
            </strong>
            {syncRelative ? (
              <small className="mt-[3px] block text-[11px] text-muted">{syncRelative}</small>
            ) : null}
          </div>
        </div>
        <Link
          href="/integrations"
          className="relative flex min-h-[39px] items-center gap-3 rounded-lg px-3 text-sm text-[#5d6a80] hover:bg-[#f6f7f8] hover:text-ink"
        >
          <Plug className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.7} />
          Integrations
        </Link>
        <Link
          href="/settings"
          className="relative flex min-h-[39px] items-center gap-3 rounded-lg px-3 text-sm text-[#5d6a80] hover:bg-[#f6f7f8] hover:text-ink"
        >
          <Settings className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.7} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
