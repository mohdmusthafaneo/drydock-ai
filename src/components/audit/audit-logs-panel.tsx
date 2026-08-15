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
};

const FILTERS: Array<{ id: AuditFilterCategory; label: string }> = [
  { id: "all", label: "All events" },
  { id: "approvals", label: "Approval decisions" },
  { id: "releases", label: "Releases" },
  { id: "integrations", label: "Integrations" },
  { id: "agents", label: "Analysis agents" },
  { id: "conversations", label: "Conversations" },
];

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
        <section className="rounded-[24px] border border-border-subtle bg-pure-white px-6 py-5 shadow-[var(--shadow)]">
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
            {new Date(lastDecision.createdAt).toLocaleString()}
          </p>
          {filter !== "approvals" && counts.approvals > 0 && (
            <button
              type="button"
              onClick={() => setFilter("approvals")}
              className="mt-3 text-[14px] font-medium text-ink hover:text-rust"
            >
              View all approval decisions →
            </button>
          )}
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
            {filter === "approvals"
              ? "Human approval and recommendation decisions for compliance review."
              : "Chronological audit trail for your organization."}
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
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-ink">{auditActionLabel(log.action)}</span>
                    <span className="text-xs text-muted">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
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

      {filter === "approvals" && (
        <p className="text-[13px] text-muted">
          Need the full compliance export?{" "}
          <Link href="/api/audit/export" className="font-medium text-ink hover:text-rust">
            Download CSV
          </Link>
        </p>
      )}
    </div>
  );
}
