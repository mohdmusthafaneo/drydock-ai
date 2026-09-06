"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Database,
  Globe,
  LayoutGrid,
  Plug,
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

  const syncLabel = lastSyncAt
    ? `Data synced · ${formatDistanceToNow(new Date(lastSyncAt))}`
    : "Never synced";

  function setTeam(team: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (team) params.set("team", team);
    else params.delete("team");
    const qs = params.toString();
    const base = pathname.startsWith("/dashboard") ? "/dashboard" : pathname;
    router.push(qs ? `${base}?${qs}` : base);
  }

  return (
    <aside
      data-slot="sidebar"
      className="hidden h-full w-[240px] shrink-0 flex-col border-r border-border bg-pure-white lg:flex"
    >
      <div className="flex shrink-0 flex-col gap-4 p-4">
        <Link href={homePath} className="flex min-w-0 items-center gap-2.5">
          <OrgMark size={28} />
          <span className="truncate text-[15px] font-semibold tracking-tight text-ink">
            {organizationName}
          </span>
        </Link>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-left text-sm text-faint hover:bg-hover"
        >
          <span className="flex-1 truncate">Search…</span>
          <kbd className="rounded border border-border bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        <p className="px-2 py-2 text-[11px] font-medium tracking-[0.06em] text-muted uppercase">
          Workspace
        </p>
        <ul className="space-y-0.5">
          <li>
            <button
              type="button"
              onClick={() => setTeam(null)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm",
                !activeTeam
                  ? "bg-accent-soft font-medium text-ink"
                  : "text-secondary hover:bg-hover",
              )}
            >
              <Users
                className={cn("h-4 w-4 shrink-0", !activeTeam ? "text-accent" : "text-muted")}
                strokeWidth={1.5}
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
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm",
                    active
                      ? "bg-accent-soft font-medium text-ink"
                      : "text-secondary hover:bg-hover",
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-muted")}
                    strokeWidth={1.5}
                  />
                  <span className="truncate">{project.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 space-y-2 border-t border-border p-3">
        <div className="rounded-lg border border-border bg-elevated/60 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                lastSyncAt ? "bg-success" : "bg-faint",
              )}
            />
            <p className="truncate text-xs text-secondary">{syncLabel}</p>
          </div>
        </div>
        <Link
          href="/integrations"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-secondary hover:bg-hover hover:text-primary"
        >
          <Plug className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.5} />
          Integrations
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-secondary hover:bg-hover hover:text-primary"
        >
          <Settings className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.5} />
          Settings
        </Link>
      </div>
    </aside>
  );
}
