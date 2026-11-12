"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { LifecycleSnapshot } from "@/lib/delivery-analysis/lifecycle-types";
import type { LifecycleIssue, LifecyclePersonRow } from "@/lib/delivery-analysis/lifecycle-types";
import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatDays(hours: number | null | undefined): string {
  if (hours == null) return "—";
  const days = hours / 24;
  return days < 10 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`;
}

function formatHoursShort(hours: number | null | undefined): string {
  if (hours == null) return "—";
  if (hours < 48) return `${Math.round(hours)}h`;
  return formatDays(hours);
}

type TicketSortKey =
  | "key"
  | "assignee"
  | "status"
  | "ageHours"
  | "cycleHours"
  | "leadHours";

type PersonSortKey =
  | "assignee"
  | "openWip"
  | "staleCount"
  | "throughput"
  | "medianCycleHours"
  | "medianLeadHours";

function compareNullable(
  a: number | null | undefined,
  b: number | null | undefined,
  dir: number,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

export function LifecycleTab({ lifecycle }: { lifecycle?: LifecycleSnapshot }) {
  if (!lifecycle || lifecycle.source === "unavailable") {
    return (
      <div className="rounded-lg border border-border-subtle bg-elevated/30 px-4 py-6 text-sm text-muted">
        <p className="font-medium text-primary">Ticket lifecycle unavailable</p>
        <p className="mt-1 text-secondary">
          {lifecycle?.unavailableReason ??
            "No issue sample yet. Connect Jira and run calibration or sync to populate cycle and lead times."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {lifecycle.transitionsInferred ? (
        <p className="text-xs text-muted">
          Stage timings include educated guesses where changelog samples were not available.
          Ticket cycle/lead time is distinct from Productivity PR cycle time.
        </p>
      ) : null}
      <LifecycleKpiStrip lifecycle={lifecycle} />
      <LifecycleStagePanel lifecycle={lifecycle} />
      <LifecycleTicketTable lifecycle={lifecycle} />
      <LifecyclePersonTable lifecycle={lifecycle} />
    </div>
  );
}

function LifecycleKpiStrip({ lifecycle }: { lifecycle: LifecycleSnapshot }) {
  const { kpis } = lifecycle;
  const evidence =
    lifecycle.source === "mock"
      ? "Mock Jira-derived sample"
      : "Jira issue+changelog sample";

  const items: Array<{
    label: string;
    value: string;
    tip: string;
  }> = [
    {
      label: "Median cycle",
      value: formatDays(kpis.medianCycleHours),
      tip: "First In Progress → Done (ticket time). Not PR cycle time.",
    },
    {
      label: "Median lead",
      value: formatDays(kpis.medianLeadHours),
      tip: "Created → Done for resolved tickets in the sample.",
    },
    {
      label: "Throughput",
      value: kpis.throughput.toLocaleString(),
      tip: `Issues resolved in ${kpis.rangeLabel.toLowerCase()}.`,
    },
    {
      label: "Current WIP",
      value: kpis.currentWip.toLocaleString(),
      tip: "Open issues in In Progress, QA-like, or Blocked statuses.",
    },
    {
      label: "Aging WIP",
      value:
        kpis.agingWipPct != null
          ? `${kpis.agingWipCount} (${kpis.agingWipPct}%)`
          : String(kpis.agingWipCount),
      tip: `Open work with no status change for ≥${kpis.agingThresholdDays} days.`,
    },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <p className="text-sm font-medium text-primary">Flow metrics</p>
        <InfoTip
          definition="Ticket flow from Jira samples. Cycle and lead are ticket durations, not GitHub PR cycle time."
          evidenceSource={`${evidence} · ${kpis.sampleSize} issues${kpis.sampleCapped ? " (capped)" : ""}`}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border-subtle bg-elevated/30 px-3 py-2"
          >
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted">{item.label}</p>
              <InfoTip definition={item.tip} evidenceSource={evidence} />
            </div>
            <p className="text-xl font-semibold tabular-nums text-primary">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LifecycleStagePanel({ lifecycle }: { lifecycle: LifecycleSnapshot }) {
  const rows = lifecycle.stageRows.slice(0, 10);
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">No status distribution in this sample.</p>
    );
  }

  const maxCount = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <p className="text-sm font-medium text-primary">Time in status</p>
        <InfoTip
          definition="Count of sampled tickets currently in each status, with median hours spent in that status from transitions."
          evidenceSource="Status changelog transitions"
        />
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.status} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-2">
            <span className="truncate text-xs text-secondary" title={row.status}>
              {row.status}
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-hover">
              <div
                className="h-full rounded-full bg-chart-blue/80"
                style={{ width: `${Math.max(6, (row.count / maxCount) * 100)}%` }}
              />
            </div>
            <span className="text-right text-xs tabular-nums text-muted">
              {row.count} · {formatHoursShort(row.medianHours)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LifecycleTicketTable({ lifecycle }: { lifecycle: LifecycleSnapshot }) {
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<TicketSortKey>("ageHours");
  const [asc, setAsc] = useState(false);

  const assignees = useMemo(() => {
    const names = new Set<string>();
    for (const issue of lifecycle.issues) {
      names.add(issue.assignee?.trim() || "Unassigned");
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [lifecycle.issues]);

  const agingHours = lifecycle.kpis.agingThresholdDays * 24;

  const rows = useMemo(() => {
    let list = [...lifecycle.issues];
    if (assigneeFilter !== "all") {
      list = list.filter(
        (i) => (i.assignee?.trim() || "Unassigned") === assigneeFilter,
      );
    }
    if (categoryFilter !== "all") {
      list = list.filter((i) => i.statusCategory === categoryFilter);
    }
    if (staleOnly) {
      list = list.filter(
        (i) =>
          i.statusCategory !== "done" &&
          i.ageHours != null &&
          i.ageHours >= agingHours,
      );
    }
    const dir = asc ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "key":
          return a.key.localeCompare(b.key) * dir;
        case "assignee":
          return (
            (a.assignee ?? "Unassigned").localeCompare(b.assignee ?? "Unassigned") *
            dir
          );
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "ageHours":
          return compareNullable(a.ageHours, b.ageHours, dir);
        case "cycleHours":
          return compareNullable(a.cycleHours, b.cycleHours, dir);
        case "leadHours":
          return compareNullable(a.leadHours, b.leadHours, dir);
        default:
          return 0;
      }
    });
    return list.slice(0, 80);
  }, [
    lifecycle.issues,
    assigneeFilter,
    categoryFilter,
    staleOnly,
    sortKey,
    asc,
    agingHours,
  ]);

  function onSort(key: TicketSortKey) {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(key === "key" || key === "assignee" || key === "status");
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-primary">Tickets</p>
          <InfoTip
            definition="Sampled tickets with age, cycle, and lead time. Missing values show — with a reason on hover when available."
            evidenceSource="Jira browse links"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            className="rounded-md border border-border-subtle bg-canvas px-2 py-1 text-secondary"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            aria-label="Filter by assignee"
          >
            <option value="all">All assignees</option>
            {assignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-border-subtle bg-canvas px-2 py-1 text-secondary"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by status category"
          >
            <option value="all">All stages</option>
            <option value="todo">To Do</option>
            <option value="inProgress">In Progress</option>
            <option value="qa">QA</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
            <option value="other">Other</option>
          </select>
          <label className="inline-flex items-center gap-1.5 text-secondary">
            <input
              type="checkbox"
              checked={staleOnly}
              onChange={(e) => setStaleOnly(e.target.checked)}
            />
            Aging only
          </label>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border-subtle bg-elevated/40 text-xs text-muted">
            <tr>
              <TicketHeader label="Key" sortKey="key" active={sortKey} asc={asc} onSort={onSort} />
              <th className="px-3 py-2 font-medium">Summary</th>
              <TicketHeader
                label="Assignee"
                sortKey="assignee"
                active={sortKey}
                asc={asc}
                onSort={onSort}
              />
              <TicketHeader
                label="Status"
                sortKey="status"
                active={sortKey}
                asc={asc}
                onSort={onSort}
              />
              <TicketHeader
                label="Age"
                sortKey="ageHours"
                active={sortKey}
                asc={asc}
                onSort={onSort}
              />
              <TicketHeader
                label="Cycle"
                sortKey="cycleHours"
                active={sortKey}
                asc={asc}
                onSort={onSort}
              />
              <TicketHeader
                label="Lead"
                sortKey="leadHours"
                active={sortKey}
                asc={asc}
                onSort={onSort}
              />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  No tickets match these filters.
                </td>
              </tr>
            ) : (
              rows.map((issue) => <TicketRow key={issue.key} issue={issue} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TicketHeader({
  label,
  sortKey,
  active,
  asc,
  onSort,
}: {
  label: string;
  sortKey: TicketSortKey;
  active: TicketSortKey;
  asc: boolean;
  onSort: (key: TicketSortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 hover:text-primary",
          isActive ? "text-primary" : "text-muted",
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        {isActive ? (asc ? " ↑" : " ↓") : null}
      </button>
    </th>
  );
}

function TicketRow({ issue }: { issue: LifecycleIssue }) {
  const gapTitle = issue.metricGaps?.join(" · ");
  return (
    <tr className="border-b border-border-subtle/80 last:border-0">
      <td className="px-3 py-2 align-top">
        {issue.jiraUrl ? (
          <a
            href={issue.jiraUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
          >
            {issue.key}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="font-medium text-primary">{issue.key}</span>
        )}
        {issue.riskReason ? (
          <Badge variant="warning" className="ml-1 align-middle">
            risk
          </Badge>
        ) : null}
      </td>
      <td className="max-w-[16rem] truncate px-3 py-2 align-top text-secondary" title={issue.summary}>
        {issue.summary}
      </td>
      <td className="px-3 py-2 align-top text-secondary">
        {issue.assignee ?? "Unassigned"}
      </td>
      <td className="px-3 py-2 align-top text-secondary">{issue.status}</td>
      <td className="px-3 py-2 align-top tabular-nums text-secondary">
        {formatDays(issue.ageHours)}
      </td>
      <td
        className="px-3 py-2 align-top tabular-nums text-secondary"
        title={gapTitle}
      >
        {formatDays(issue.cycleHours)}
      </td>
      <td
        className="px-3 py-2 align-top tabular-nums text-secondary"
        title={gapTitle}
      >
        {formatDays(issue.leadHours)}
      </td>
    </tr>
  );
}

function LifecyclePersonTable({ lifecycle }: { lifecycle: LifecycleSnapshot }) {
  const [sortKey, setSortKey] = useState<PersonSortKey>("openWip");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const list = [...lifecycle.byPerson];
    const dir = asc ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "assignee":
          return a.assignee.localeCompare(b.assignee) * dir;
        case "openWip":
          return (a.openWip - b.openWip) * dir;
        case "staleCount":
          return (a.staleCount - b.staleCount) * dir;
        case "throughput":
          return (a.throughput - b.throughput) * dir;
        case "medianCycleHours":
          return compareNullable(a.medianCycleHours, b.medianCycleHours, dir);
        case "medianLeadHours":
          return compareNullable(a.medianLeadHours, b.medianLeadHours, dir);
        default:
          return 0;
      }
    });
    return list;
  }, [lifecycle.byPerson, sortKey, asc]);

  function onSort(key: PersonSortKey) {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(key === "assignee");
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <p className="text-sm font-medium text-primary">People</p>
        <InfoTip
          definition="Per-assignee ticket flow metrics on Delivery Lifecycle only. No composite person score. Distinct from Productivity PR metrics."
          evidenceSource="Assignee field on sampled Jira issues"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border-subtle bg-elevated/40 text-xs text-muted">
            <tr>
              <PersonHeader
                label="Assignee"
                sortKey="assignee"
                active={sortKey}
                asc={asc}
                onSort={onSort}
              />
              <PersonHeader
                label="WIP"
                sortKey="openWip"
                active={sortKey}
                asc={asc}
                onSort={onSort}
              />
              <PersonHeader
                label="Aging"
                sortKey="staleCount"
                active={sortKey}
                asc={asc}
                onSort={onSort}
              />
              <PersonHeader
                label="Throughput"
                sortKey="throughput"
                active={sortKey}
                asc={asc}
                onSort={onSort}
              />
              <PersonHeader
                label="Med. cycle"
                sortKey="medianCycleHours"
                active={sortKey}
                asc={asc}
                onSort={onSort}
              />
              <PersonHeader
                label="Med. lead"
                sortKey="medianLeadHours"
                active={sortKey}
                asc={asc}
                onSort={onSort}
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <PersonRow key={row.assignee} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PersonHeader({
  label,
  sortKey,
  active,
  asc,
  onSort,
}: {
  label: string;
  sortKey: PersonSortKey;
  active: PersonSortKey;
  asc: boolean;
  onSort: (key: PersonSortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 hover:text-primary",
          isActive ? "text-primary" : "text-muted",
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        {isActive ? (asc ? " ↑" : " ↓") : null}
      </button>
    </th>
  );
}

function PersonRow({ row }: { row: LifecyclePersonRow }) {
  return (
    <tr className="border-b border-border-subtle/80 last:border-0">
      <td className="px-3 py-2 font-medium text-primary">{row.assignee}</td>
      <td className="px-3 py-2 tabular-nums text-secondary">{row.openWip}</td>
      <td className="px-3 py-2 tabular-nums text-secondary">{row.staleCount}</td>
      <td className="px-3 py-2 tabular-nums text-secondary">{row.throughput}</td>
      <td className="px-3 py-2 tabular-nums text-secondary">
        {formatDays(row.medianCycleHours)}
      </td>
      <td className="px-3 py-2 tabular-nums text-secondary">
        {formatDays(row.medianLeadHours)}
      </td>
    </tr>
  );
}
