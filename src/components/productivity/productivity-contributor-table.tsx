"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type {
  ProductivityContributorMetrics,
  ProductivityPullRequest,
  ProductivitySnapshot,
} from "@/lib/productivity/types";
import { cn } from "@/lib/utils";

type SortKey =
  | "rank"
  | "name"
  | "prsMerged"
  | "ticketsWorkedOn"
  | "storyPointsCompleted"
  | "ticketsSkipped"
  | "medianCycleHours"
  | "medianFirstReviewHours"
  | "reviewsGiven"
  | "medianReviewTurnaroundHours"
  | "linesNet"
  | "unreviewedMergeRate"
  | "aiShare";

function formatDays(hours: number | null): string {
  if (hours == null) return "—";
  const days = hours / 24;
  return days < 10 ? `${days.toFixed(1)}d` : `${Math.round(days)}d`;
}

function formatLinesNet(n: number): string {
  const abs = Math.abs(n);
  const formatted =
    abs >= 1000 ? `${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(abs);
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `−${formatted}`;
  return "0";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatDateShort(iso: string): string {
  // Avoid toLocaleDateString — can hydrate differently across environments.
  const d = new Date(iso);
  const month = MONTHS[d.getUTCMonth()] ?? "Jan";
  return `${month} ${d.getUTCDate()}`;
}

const AVATAR_TONES = [
  { bg: "bg-[#FFF0E8]", text: "text-[#C45A1A]" },
  { bg: "bg-[#FDE8EC]", text: "text-[#B4234A]" },
  { bg: "bg-[#EEE8FF]", text: "text-[#5B3CC4]" },
  { bg: "bg-[#E6F7F1]", text: "text-[#0F766E]" },
  { bg: "bg-[#FFF6E0]", text: "text-[#B45309]" },
  { bg: "bg-[#E8F1FF]", text: "text-[#1D4ED8]" },
] as const;

function avatarTone(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i) * (i + 1)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

function compareNullable(
  a: number | null,
  b: number | null,
  dir: 1 | -1,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

function sortContributors(
  rows: ProductivityContributorMetrics[],
  key: SortKey,
  asc: boolean,
): ProductivityContributorMetrics[] {
  const dir: 1 | -1 = asc ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (key) {
      case "rank":
        return (a.rank - b.rank) * dir;
      case "name":
        return a.contributor.displayName.localeCompare(b.contributor.displayName) * dir;
      case "prsMerged":
        return (a.prsMerged - b.prsMerged) * dir;
      case "ticketsWorkedOn":
        return (a.ticketsWorkedOn - b.ticketsWorkedOn) * dir;
      case "storyPointsCompleted":
        return (a.storyPointsCompleted - b.storyPointsCompleted) * dir;
      case "ticketsSkipped":
        return (a.ticketsSkipped - b.ticketsSkipped) * dir;
      case "medianCycleHours":
        return compareNullable(a.medianCycleHours, b.medianCycleHours, dir);
      case "medianFirstReviewHours":
        return compareNullable(a.medianFirstReviewHours, b.medianFirstReviewHours, dir);
      case "reviewsGiven":
        return (a.reviewsGiven - b.reviewsGiven) * dir;
      case "medianReviewTurnaroundHours":
        return compareNullable(
          a.medianReviewTurnaroundHours,
          b.medianReviewTurnaroundHours,
          dir,
        );
      case "linesNet":
        return (a.linesNet - b.linesNet) * dir;
      case "unreviewedMergeRate":
        return (a.unreviewedMergeRate - b.unreviewedMergeRate) * dir;
      case "aiShare":
        return (a.aiShare - b.aiShare) * dir;
      default:
        return 0;
    }
  });
}

function SortHeader({
  label,
  sortKey,
  active,
  asc,
  onSort,
  align = "right",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  return (
    <th
      className={cn(
        "px-3 py-2.5 text-[11px] font-medium text-muted",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-0.5 hover:text-ink",
          align === "right" && "flex-row-reverse",
          isActive && "text-ink",
        )}
      >
        {label}
        {isActive ? (
          asc ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );
}

function AiMixBar({ share }: { share: number }) {
  const pct = Math.round(share * 100);
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[#EDEFF2]">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-[12px] text-secondary">{pct}%</span>
    </div>
  );
}

function attributionLabel(attr: ProductivityPullRequest["attribution"]): string {
  if (attr === "ai_generated") return "AI gen";
  if (attr === "ai_assisted") return "AI assist";
  return "Human";
}

function PrDrillDown({
  prs,
}: {
  prs: ProductivityPullRequest[];
}) {
  if (prs.length === 0) {
    return (
      <p className="px-4 py-3 text-[12px] text-muted">No merged PRs this sprint.</p>
    );
  }

  const sorted = [...prs].sort((a, b) => {
    const am = a.mergedAt ? Date.parse(a.mergedAt) : 0;
    const bm = b.mergedAt ? Date.parse(b.mergedAt) : 0;
    return bm - am;
  });

  return (
    <div className="mx-3 my-2 overflow-hidden rounded-[9px] border border-border-soft bg-pure-white">
      <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
        <p className="text-[11px] font-medium text-muted">
          Merged PRs this sprint
        </p>
        <p className="text-[11px] tabular-nums text-faint">{sorted.length}</p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-soft text-left">
            <th className="px-3 py-1.5 text-[10px] font-medium text-muted">Ticket</th>
            <th className="px-3 py-1.5 text-[10px] font-medium text-muted">Title</th>
            <th className="px-3 py-1.5 text-right text-[10px] font-medium text-muted">
              Merged
            </th>
            <th className="px-3 py-1.5 text-right text-[10px] font-medium text-muted">
              Cycle
            </th>
            <th className="px-3 py-1.5 text-right text-[10px] font-medium text-muted">
              Lines
            </th>
            <th className="px-3 py-1.5 text-[10px] font-medium text-muted">Review</th>
            <th className="px-3 py-1.5 text-[10px] font-medium text-muted">Authorship</th>
            <th className="w-8 px-2 py-1.5" aria-hidden />
          </tr>
        </thead>
        <tbody>
          {sorted.map((pr) => {
            const cycle =
              pr.mergedAt != null
                ? formatDays(
                    (Date.parse(pr.mergedAt) - Date.parse(pr.openedAt)) /
                      (1000 * 60 * 60),
                  )
                : "—";
            const key = pr.jiraKeys[0] ?? `PR #${pr.number}`;
            const net = pr.additions - pr.deletions;
            return (
              <tr
                key={pr.id}
                className="border-b border-border-soft last:border-b-0 hover:bg-[#FAFBFC]"
              >
                <td className="px-3 py-2 align-middle">
                  <span className="inline-flex rounded-[5px] bg-elevated px-[6px] py-[2px] text-[11px] font-semibold tabular-nums text-ink">
                    {key}
                  </span>
                </td>
                <td className="max-w-[280px] px-3 py-2 align-middle">
                  <p className="truncate text-[12px] font-medium text-ink">{pr.title}</p>
                  {pr.jiraKeys.length > 1 ? (
                    <p className="mt-0.5 truncate text-[10px] text-muted">
                      Also {pr.jiraKeys.slice(1).join(", ")}
                    </p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-[12px] tabular-nums text-secondary">
                  {pr.mergedAt ? formatDateShort(pr.mergedAt) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-[12px] tabular-nums text-secondary">
                  {cycle}
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-3 py-2 text-right text-[12px] tabular-nums font-medium",
                    net > 0 ? "text-success" : "text-secondary",
                  )}
                >
                  {formatLinesNet(net)}
                </td>
                <td className="px-3 py-2 align-middle">
                  {pr.unreviewed ? (
                    <span className="inline-flex rounded-[5px] bg-coral-soft px-[6px] py-[2px] text-[10px] font-medium text-coral">
                      Unreviewed
                    </span>
                  ) : (
                    <span className="text-[12px] text-secondary">Reviewed</span>
                  )}
                </td>
                <td className="px-3 py-2 align-middle text-[12px] text-secondary">
                  {attributionLabel(pr.attribution)}
                </td>
                <td className="px-2 py-2 align-middle">
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-faint hover:bg-hover hover:text-ink"
                    aria-label={`Open PR #${pr.number}`}
                    title={`PR #${pr.number}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const COL_COUNT = 13;

export function ProductivityContributorTable({
  snapshot,
  className,
}: {
  snapshot: ProductivitySnapshot;
  className?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("prsMerged");
  const [asc, setAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(
    () => sortContributors(snapshot.contributors, sortKey, asc),
    [snapshot.contributors, sortKey, asc],
  );

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setAsc((v) => !v);
    } else {
      setSortKey(key);
      setAsc(key === "name");
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]",
        className,
      )}
      data-slot="productivity-contributor-table"
    >
      <div className="flex items-center justify-between px-[18px] pt-[15px] pb-2">
        <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-ink">
          Contributors
        </h2>
        <p className="text-[11px] text-muted">
          Tickets &amp; story points for {snapshot.sprintLabel}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse">
          <thead>
            <tr className="border-b border-border-soft">
              <SortHeader label="#" sortKey="rank" active={sortKey} asc={asc} onSort={onSort} align="left" />
              <SortHeader label="Contributor" sortKey="name" active={sortKey} asc={asc} onSort={onSort} align="left" />
              <SortHeader label="PRs merged" sortKey="prsMerged" active={sortKey} asc={asc} onSort={onSort} />
              <SortHeader label="Tickets worked" sortKey="ticketsWorkedOn" active={sortKey} asc={asc} onSort={onSort} />
              <SortHeader label="SP done" sortKey="storyPointsCompleted" active={sortKey} asc={asc} onSort={onSort} />
              <SortHeader label="Skipped" sortKey="ticketsSkipped" active={sortKey} asc={asc} onSort={onSort} />
              <SortHeader label="Med. cycle" sortKey="medianCycleHours" active={sortKey} asc={asc} onSort={onSort} />
              <SortHeader label="Med. first review" sortKey="medianFirstReviewHours" active={sortKey} asc={asc} onSort={onSort} />
              <SortHeader label="Reviews given" sortKey="reviewsGiven" active={sortKey} asc={asc} onSort={onSort} />
              <SortHeader label="Med. review turnaround" sortKey="medianReviewTurnaroundHours" active={sortKey} asc={asc} onSort={onSort} />
              <SortHeader label="Lines net" sortKey="linesNet" active={sortKey} asc={asc} onSort={onSort} />
              <SortHeader label="Unreviewed %" sortKey="unreviewedMergeRate" active={sortKey} asc={asc} onSort={onSort} />
              <SortHeader label="AI mix" sortKey="aiShare" active={sortKey} asc={asc} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = row.contributor.id;
              const open = expandedId === id;
              const unreviewedPct = Math.round(row.unreviewedMergeRate * 100);
              const tone = avatarTone(id);
              const prs = row.pullRequestIds
                .map((pid) => snapshot.pullRequestsById[pid])
                .filter((p): p is ProductivityPullRequest => Boolean(p));

              return (
                <Fragment key={id}>
                  <tr
                    className={cn(
                      "border-b border-border-soft transition-colors",
                      open ? "bg-accent-soft/40" : "hover:bg-[#FAFBFC]",
                    )}
                    data-expanded={open ? "true" : "false"}
                  >
                    <td className="px-2.5 py-2.5 text-[13px] text-muted">{row.rank}</td>
                    <td className="px-2.5 py-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId((prev) => (prev === id ? null : id))
                        }
                        className="flex items-center gap-2.5 text-left"
                        aria-expanded={open}
                      >
                        <span
                          className={cn(
                            "flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                            tone.bg,
                            tone.text,
                          )}
                        >
                          {row.contributor.avatarInitials}
                        </span>
                        <span>
                          <span className="block text-[13px] font-semibold text-ink">
                            {row.contributor.displayName}
                          </span>
                          <span className="block text-[11px] text-muted">
                            @{row.contributor.githubHandle}
                          </span>
                        </span>
                        <ChevronDown
                          className={cn(
                            "ml-1 h-3.5 w-3.5 text-faint transition-transform",
                            open && "rotate-180",
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[13px] tabular-nums text-ink">
                      {row.prsMerged}
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[13px] tabular-nums text-ink">
                      {row.ticketsWorkedOn}
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[13px] tabular-nums font-medium text-ink">
                      {row.storyPointsCompleted}
                    </td>
                    <td
                      className={cn(
                        "px-2.5 py-2.5 text-right text-[13px] tabular-nums",
                        row.ticketsSkipped > 0 ? "text-ink" : "text-secondary",
                      )}
                    >
                      <span className="font-medium">{row.ticketsSkipped}</span>
                      <span className="text-muted">
                        {" "}
                        · {row.storyPointsSkipped}sp
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[13px] tabular-nums text-secondary">
                      {formatDays(row.medianCycleHours)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[13px] tabular-nums text-secondary">
                      {formatDays(row.medianFirstReviewHours)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[13px] tabular-nums text-ink">
                      {row.reviewsGiven}
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[13px] tabular-nums text-secondary">
                      {formatDays(row.medianReviewTurnaroundHours)}
                    </td>
                    <td
                      className={cn(
                        "px-2.5 py-2.5 text-right text-[13px] tabular-nums font-medium",
                        row.linesNet > 0 ? "text-success" : "text-secondary",
                      )}
                    >
                      {formatLinesNet(row.linesNet)}
                    </td>
                    <td
                      className={cn(
                        "px-2.5 py-2.5 text-right text-[13px] tabular-nums",
                        unreviewedPct >= 20 ? "font-medium text-error" : "text-secondary",
                      )}
                    >
                      {unreviewedPct}%
                    </td>
                    <td className="px-2.5 py-2.5">
                      <AiMixBar share={row.aiShare} />
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-b border-border-soft bg-[#FCFCFD]">
                      <td colSpan={COL_COUNT} className="px-2 py-1">
                        <PrDrillDown prs={prs} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
