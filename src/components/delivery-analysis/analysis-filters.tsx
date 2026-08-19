"use client";

import { cn } from "@/lib/utils";
import type { DeliveryAnalysisFilters } from "@/lib/delivery-analysis/types";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";

type Props = {
  filters: DeliveryAnalysisFilters;
  projectKeys: string[];
  onChange: (next: Partial<DeliveryAnalysisFilters>) => void;
  onSync: () => void;
  onExport: () => void;
  syncing: boolean;
  canSync: boolean;
  lastSyncedLabel: string;
  exportDisabled?: boolean;
};

export function AnalysisFiltersBar({
  filters,
  projectKeys,
  onChange,
  onSync,
  onExport,
  syncing,
  canSync,
  lastSyncedLabel,
  exportDisabled = false,
}: Props) {
  return (
    <div className="sticky top-0 z-10 -mx-1 rounded-xl border border-border bg-surface/95 p-3 backdrop-blur-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Project"
            value={filters.projectKey ?? "all"}
            options={[
              { value: "all", label: "All projects" },
              ...projectKeys.map((k) => ({ value: k, label: k })),
            ]}
            onChange={(v) => onChange({ projectKey: v === "all" ? null : v })}
          />
          <FilterSelect
            label="Risk focus"
            value={filters.riskFocus}
            options={[
              { value: "all", label: "All risks" },
              { value: "blockers", label: "Blockers" },
              { value: "schedule", label: "Schedule" },
              { value: "quality", label: "Quality" },
              { value: "sprint", label: "Sprint" },
            ]}
            onChange={(v) => onChange({ riskFocus: v as DeliveryAnalysisFilters["riskFocus"] })}
          />
          <FilterSelect
            label="Range"
            value={filters.range}
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "90d", label: "90 days" },
            ]}
            onChange={(v) => onChange({ range: v as DeliveryAnalysisFilters["range"] })}
          />
          <FilterSelect
            label="Compare"
            value={filters.compare}
            options={[{ value: "previous_sync", label: "vs prior sync" }]}
            onChange={(v) => onChange({ compare: v as DeliveryAnalysisFilters["compare"] })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">{lastSyncedLabel}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onExport}
            disabled={exportDisabled}
            title={exportDisabled ? "Sync Jira and load data before exporting" : undefined}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button
            type="button"
            variant="brand"
            size="sm"
            disabled={syncing || !canSync}
            onClick={onSync}
            title={canSync ? undefined : "Requires manage integrations permission"}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
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
        className="h-8 rounded-2xl border border-dove bg-pure-white px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-rust/30"
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
