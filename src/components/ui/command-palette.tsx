"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOverviewNavHref } from "@/components/overview/overview-link";
import { cn } from "@/lib/utils";

export type CommandPaletteDestination = {
  href: string;
  label: string;
};

export type CommandPaletteWorkspace = {
  key: string;
  name: string;
};

export function CommandPalette({
  open,
  onOpenChange,
  destinations,
  workspaces,
  onSelectWorkspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinations: CommandPaletteDestination[];
  workspaces: CommandPaletteWorkspace[];
  onSelectWorkspace?: (key: string) => void;
}) {
  const router = useRouter();
  const resolveHref = useOverviewNavHref();
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  function handleOpenChange(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  const q = query.trim().toLowerCase();
  const filteredDestinations = useMemo(
    () =>
      destinations.filter((item) =>
        q ? item.label.toLowerCase().includes(q) : true,
      ),
    [destinations, q],
  );
  const filteredWorkspaces = useMemo(
    () =>
      workspaces.filter((item) =>
        q ? item.name.toLowerCase().includes(q) || item.key.toLowerCase().includes(q) : true,
      ),
    [workspaces, q],
  );

  function go(href: string) {
    handleOpenChange(false);
    router.push(resolveHref(href));
  }

  function selectWorkspace(key: string) {
    handleOpenChange(false);
    if (onSelectWorkspace) {
      onSelectWorkspace(key);
      return;
    }
    router.push(resolveHref(`/dashboard?team=${encodeURIComponent(key)}`));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showClose={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        data-slot="command-palette"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Jump to a page or workspace</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages and workspaces…"
            className="h-12 w-full bg-transparent text-sm text-primary outline-none placeholder:text-faint"
          />
          <kbd className="hidden rounded border border-border bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted sm:inline">
            esc
          </kbd>
        </div>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {filteredDestinations.length > 0 ? (
            <div className="mb-2">
              <p className="px-2 py-1.5 text-[11px] font-medium tracking-[0.06em] text-muted uppercase">
                Pages
              </p>
              <ul className="space-y-0.5">
                {filteredDestinations.map((item) => (
                  <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => go(item.href)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-primary",
                        "hover:bg-hover",
                      )}
                    >
                      <LayoutGrid className="h-4 w-4 text-muted" strokeWidth={1.5} />
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {filteredWorkspaces.length > 0 ? (
            <div>
              <p className="px-2 py-1.5 text-[11px] font-medium tracking-[0.06em] text-muted uppercase">
                Workspaces
              </p>
              <ul className="space-y-0.5">
                {filteredWorkspaces.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => selectWorkspace(item.key)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-primary",
                        "hover:bg-hover",
                      )}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded border border-border text-[9px] font-medium text-muted">
                        {item.key.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="truncate">{item.name}</span>
                      <span className="ml-auto truncate text-xs text-faint">{item.key}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {filteredDestinations.length === 0 && filteredWorkspaces.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">No matches</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
