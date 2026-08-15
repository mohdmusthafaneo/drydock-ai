import Link from "next/link";
import type { LatestQaRunSummary } from "@/lib/agent-analysis/types";
import { Badge } from "@/components/ui/badge";

/**
 * Detail-only QA evidence lists. Executive summary lives in AgentPageShell.
 */
export function QaAgentRunPanel({
  run,
  section = "all",
  issueTypeFilter,
  evidenceOverride,
  emptyMessage,
}: {
  run: LatestQaRunSummary | null;
  section?: "all" | "blocked" | "bugs";
  /** Set to a specific issueType to show only that type, or "!Bug" to exclude Bug. */
  issueTypeFilter?: string;
  /** Pass pre-filtered evidence rows to bypass internal filtering. */
  evidenceOverride?: LatestQaRunSummary["evidence"];
  /** Custom empty-state message when evidenceOverride is provided. */
  emptyMessage?: string;
}) {
  if (!run && evidenceOverride === undefined) {
    return (
      <div className="space-y-2 text-sm text-secondary">
        <p>
          No verified QA analysis yet. Scheduled refreshes (or Refresh all agents) populate this
          when Jira projects are connected.
        </p>
        <p className="text-xs text-muted">
          Advanced:{" "}
          <Link href="/agent-threads/new" className="underline-offset-4 hover:underline">
            run QA agent in Conversations
          </Link>
        </p>
      </div>
    );
  }

  // When evidenceOverride is provided, use it directly without further filtering.
  if (evidenceOverride !== undefined) {
    return (
      <EvidenceList rows={evidenceOverride} empty={emptyMessage ?? "No evidence in the latest sample."} />
    );
  }

  let blockedEvidence = run!.evidence.filter((e) => e.preset === "BLOCKED");
  let bugEvidence = run!.evidence.filter((e) => e.preset === "OPEN_BUGS");

  if (issueTypeFilter === "!Bug") {
    bugEvidence = bugEvidence.filter((e) => e.issueType !== "Bug");
  } else if (issueTypeFilter && issueTypeFilter !== "all") {
    bugEvidence = bugEvidence.filter((e) => e.issueType === issueTypeFilter);
  }

  return (
    <div className="space-y-6">
      {(section === "all" || section === "blocked") && (
        <EvidenceList
          title={section === "all" ? "Blocked issues" : undefined}
          rows={blockedEvidence}
          empty="No blocked issues in the evidence sample."
        />
      )}
      {(section === "all" || section === "bugs") && (
        <EvidenceList
          title={section === "all" ? "Open bugs" : undefined}
          rows={bugEvidence}
          empty={
            issueTypeFilter === "!Bug"
              ? "No issue-type evidence in the latest sample."
              : "No open-bug evidence in the latest sample."
          }
        />
      )}
    </div>
  );
}

function EvidenceList({
  title,
  rows,
  empty,
}: {
  title?: string;
  rows: LatestQaRunSummary["evidence"];
  empty: string;
}) {
  return (
    <div className="space-y-2">
      {title ? <p className="text-sm font-medium text-ink">{title}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        rows.slice(0, 10).map((row) => (
          <div
            key={`${row.preset}-${row.issueKey}`}
            className="rounded-lg border border-border-subtle bg-elevated/60 px-3 py-2 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-primary">{row.issueKey}</span>
              <Badge variant="muted">{row.status}</Badge>
            </div>
            <p className="mt-1 text-secondary">{row.summary}</p>
            <p className="mt-1 text-xs text-muted">
              {[row.priority, row.assignee].filter(Boolean).join(" · ") || "Unassigned"}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
