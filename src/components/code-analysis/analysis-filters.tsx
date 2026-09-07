"use client";

import { cn } from "@/lib/utils";
import type { CodeAnalysisFilters, TimeRange } from "@/lib/code-analysis/types";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";

type Props = {
  filters: CodeAnalysisFilters;
  repos: string[];
  authors: string[];
  onChange: (next: Partial<CodeAnalysisFilters>) => void;
  onSync: () => void;
  onExport: () => void;
  syncing: boolean;
  lastSyncedLabel: string;
};

export function AnalysisFiltersBar({
  filters,
  repos,
  authors,
  onChange,
  onSync,
  onExport,
  syncing,
  lastSyncedLabel,
}: Props) {
  function toggleRepo(repo: string) {
    const current = filters.repos;
    const next =
      current.includes(repo) && current.length > 1
        ? current.filter((r) => r !== repo)
        : current.includes(repo)
          ? current
          : [...current, repo];
    onChange({ repos: next.length > 0 ? next : repos });
  }

  return (
    <div className="sticky top-0 z-10 -mx-1 rounded-[var(--radius-card)] border border-border bg-pure-white/95 p-3 backdrop-blur-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Repos"
            value={filters.repos.length === repos.length ? "all" : filters.repos[0]}
            options={[
              { value: "all", label: "All repos" },
              ...repos.map((r) => ({ value: r, label: r.split("/")[1] ?? r })),
            ]}
            onChange={(v) => {
              if (v === "all") onChange({ repos: [...repos] });
              else onChange({ repos: [v] });
            }}
          />
          <FilterSelect
            label="Branch"
            value={filters.branch}
            options={[
              { value: "default", label: "Default branch" },
              { value: "all", label: "All branches" },
            ]}
            onChange={(v) => onChange({ branch: v as CodeAnalysisFilters["branch"] })}
          />
          <FilterSelect
            label="Range"
            value={filters.range}
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "90d", label: "90 days" },
            ]}
            onChange={(v) => onChange({ range: v as TimeRange })}
          />
          <FilterSelect
            label="Author"
            value={filters.author ?? "all"}
            options={[
              { value: "all", label: "All authors" },
              ...authors.map((a) => ({ value: a, label: a })),
            ]}
            onChange={(v) => onChange({ author: v === "all" ? null : v })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">{lastSyncedLabel}</span>
          <Button type="button" variant="secondary" size="sm" onClick={onExport}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button type="button" variant="brown" size="sm" disabled={syncing} onClick={onSync}>
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 lg:hidden">
        {repos.map((repo) => {
          const active = filters.repos.includes(repo);
          return (
            <button
              key={repo}
              type="button"
              onClick={() => toggleRepo(repo)}
              className={cn(
                "rounded-[8px] px-2 py-0.5 text-[10px] font-medium transition-colors",
                active
                  ? "bg-sky-wash text-chart-blue"
                  : "bg-hover text-muted line-through",
              )}
            >
              {repo.split("/")[1]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      <span className="sr-only">{label}</span>
      <span className="hidden sm:inline">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-[9px] border border-border bg-pure-white px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-rust/30"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
