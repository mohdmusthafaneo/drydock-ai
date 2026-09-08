"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auditActionLabel } from "@/lib/governance/presentation";
import { useAppData, useFilters, useSetFilter } from "@/lib/store";
import { cn } from "@/lib/utils";

const CATEGORY_FILTERS = [
  { id: null, label: "All events" },
  { id: "GOVERNANCE", label: "Governance" },
  { id: "INTEGRATION", label: "Integration" },
  { id: "NAVIGATION", label: "Navigation" },
] as const;

export function AuditFromStore() {
  const logs = useAppData((s) => s.data.audit.logs);
  const { auditCategory } = useFilters();
  const setFilter = useSetFilter();

  const counts = useMemo(() => {
    const next: Record<string, number> = { all: logs.length };
    for (const log of logs) {
      next[log.category] = (next[log.category] ?? 0) + 1;
    }
    return next;
  }, [logs]);

  const filtered = useMemo(() => {
    if (!auditCategory) return logs;
    return logs.filter((log) => log.category === auditCategory);
  }, [logs, auditCategory]);

  const lastDecision = useMemo(
    () =>
      logs.find((log) =>
        [
          "recommendation.approved",
          "recommendation.rejected",
          "release.deployed",
          "release.assessed",
        ].includes(log.action),
      ) ?? null,
    [logs],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Decision log"
        description="Every decision, release sign-off, and connector action on the record. Nothing is hidden without a reason."
      >
        <Button asChild variant="ink" size="lg">
          <a href="/api/audit/export">Export CSV</a>
        </Button>
      </PageHeader>

      {lastDecision && (
        <section className="rounded-[var(--radius-card)] border border-border-subtle bg-pure-white px-6 py-5 shadow-[var(--shadow)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
            Last governance decision
          </p>
          <p className="mt-2 font-display text-[22px] leading-snug tracking-[-0.2px] text-ink">
            {auditActionLabel(lastDecision.action)}
          </p>
          <p className="mt-1 text-[14px] text-ash">
            {lastDecision.summary}
            {lastDecision.actorName ? ` · ${lastDecision.actorName}` : ""}
            {" · "}
            <span suppressHydrationWarning>
              {new Date(lastDecision.createdAt).toLocaleString("en-US", {
                month: "numeric",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              })}
            </span>
          </p>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((item) => {
          const active = (item.id ?? null) === (auditCategory ?? null);
          const count = item.id == null ? counts.all : (counts[item.id] ?? 0);
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setFilter({ auditCategory: item.id })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                active
                  ? "border-ink bg-ink text-pure-white"
                  : "border-border-subtle bg-pure-white text-ash hover:bg-fog",
              )}
            >
              {item.label}
              <span className="ml-1.5 tabular-nums opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {CATEGORY_FILTERS.find((f) => (f.id ?? null) === (auditCategory ?? null))?.label ??
              "Events"}{" "}
            ({filtered.length})
          </CardTitle>
          <CardDescription>Chronological audit trail for your organization.</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted">No events match this filter.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((log) => (
                <li key={log.id} className="rounded-xl bg-elevated px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">{auditActionLabel(log.action)}</span>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-600">
                        {log.category.toLowerCase()}
                      </span>
                      <span className="text-xs text-muted" suppressHydrationWarning>
                        {new Date(log.createdAt).toLocaleString("en-US", {
                          month: "numeric",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: true,
                        })}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-secondary">
                    {log.summary}
                    {log.actorName ? ` · ${log.actorName}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
