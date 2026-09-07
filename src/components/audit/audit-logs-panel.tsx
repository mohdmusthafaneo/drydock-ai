"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  auditActionLabel,
  countAuditByCategory,
  filterAuditLogs,
  findLastGovernanceDecision,
  type AuditFilterCategory,
} from "@/lib/governance/presentation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AuditLogItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  userName: string | null;
  actorType: string | null;
};

const FILTERS: Array<{ id: AuditFilterCategory; label: string }> = [
  { id: "all", label: "All events" },
  { id: "human", label: "Human" },
  { id: "system", label: "System" },
  { id: "integration", label: "Integration" },
];

function ActorTypeBadge({ actorType }: { actorType: string | null }) {
  const styles: Record<string, string> = {
    human: "bg-blue-100 text-blue-700",
    system: "bg-gray-100 text-gray-600",
    integration: "bg-purple-100 text-purple-700",
  };
  const cls = styles[actorType ?? ""] ?? "bg-gray-100 text-gray-500";
  const label = actorType ?? "unknown";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide", cls)}>
      {label}
    </span>
  );
}

export function AuditLogsPanel({ logs }: { logs: AuditLogItem[] }) {
  const [filter, setFilter] = useState<AuditFilterCategory>("all");

  const counts = useMemo(() => countAuditByCategory(logs), [logs]);
  const filtered = useMemo(() => filterAuditLogs(logs, filter), [logs, filter]);
  const lastDecision = useMemo(
    () =>
      findLastGovernanceDecision(
        logs.map((l) => ({
          action: l.action,
          entityType: l.entityType,
          createdAt: l.createdAt,
          userName: l.userName,
        })),
      ),
    [logs],
  );

  return (
    <div className="space-y-6">
      {lastDecision && (
        <section className="rounded-[var(--radius-card)] border border-border-subtle bg-pure-white px-6 py-5 shadow-[var(--shadow)]">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
            Last governance decision
          </p>
          <p className="mt-2 font-display text-[22px] leading-snug tracking-[-0.2px] text-ink">
            {auditActionLabel(lastDecision.action)}
          </p>
          <p className="mt-1 text-[14px] text-ash">
            {lastDecision.entityType}
            {lastDecision.userName ? ` · ${lastDecision.userName}` : ""}
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
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
              filter === item.id
                ? "border-ink bg-ink text-pure-white"
                : "border-border-subtle bg-pure-white text-ash hover:bg-fog",
            )}
          >
            {item.label}
            <span className="ml-1.5 tabular-nums opacity-70">({counts[item.id]})</span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {FILTERS.find((f) => f.id === filter)?.label ?? "Events"} ({filtered.length})
          </CardTitle>
          <CardDescription>
            Chronological audit trail for your organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted">No events match this filter.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((log) => (
                <li
                  key={log.id}
                  className="rounded-xl bg-elevated px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">{auditActionLabel(log.action)}</span>
                    <div className="flex items-center gap-2">
                      <ActorTypeBadge actorType={log.actorType} />
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
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ""}
                    {log.userName ? ` · ${log.userName}` : ""}
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
