"use client";

import { cn } from "@/lib/utils";
import type { ObservabilityAnalysisFilters } from "@/lib/observability-analysis/types";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";

type Props = {
  filters: ObservabilityAnalysisFilters;
  serviceIds: string[];
  onChange: (next: Partial<ObservabilityAnalysisFilters>) => void;
  onSync: () => void;
  onExport: () => void;
  syncing: boolean;
  canSync: boolean;
  lastSyncedLabel: string;
  exportDisabled?: boolean;
};

export function AnalysisFiltersBar({
  filters,
  serviceIds,
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
            label="Service"
            value={filters.serviceId ?? "all"}
            options={[
              { value: "all", label: "All services" },
              ...serviceIds.map((id) => ({ value: id, label: id })),
            ]}
            onChange={(v) => onChange({ serviceId: v === "all" ? null : v })}
          />
          <FilterSelect
            label="Environment"
            value={filters.environment}
            options={[
              { value: "all", label: "All environments" },
              { value: "production", label: "Production" },
              { value: "staging", label: "Staging" },
              { value: "development", label: "Development" },
            ]}
            onChange={(v) =>
              onChange({ environment: v as ObservabilityAnalysisFilters["environment"] })
            }
          />
          <FilterSelect
            label="Range"
            value={filters.range}
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "90d", label: "90 days" },
            ]}
            onChange={(v) => onChange({ range: v as ObservabilityAnalysisFilters["range"] })}
          />
          <FilterSelect
            label="Risk focus"
            value={filters.riskFocus}
            options={[
              { value: "all", label: "All signals" },
              { value: "errors", label: "Errors" },
              { value: "latency", label: "Latency" },
              { value: "resources", label: "Resources" },
              { value: "alerts", label: "Alerts" },
              { value: "deploy", label: "Deploy" },
            ]}
            onChange={(v) =>
              onChange({ riskFocus: v as ObservabilityAnalysisFilters["riskFocus"] })
            }
          />
          <FilterSelect
            label="Compare"
            value={filters.compare}
            options={[{ value: "previous_sync", label: "vs prior sync" }]}
            onChange={(v) => onChange({ compare: v as ObservabilityAnalysisFilters["compare"] })}
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
            title={exportDisabled ? "Sync Prometheus and load data before exporting" : undefined}
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
        className="h-8 rounded-md border border-border bg-input px-2 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-brand"
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
