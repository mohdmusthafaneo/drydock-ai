import Link from "next/link";
import type { LatestQaRunSummary } from "@/lib/agent-analysis/types";
import { Badge } from "@/components/ui/badge";

/**
 * Detail-only QA evidence lists. Executive summary lives in AgentPageShell.
 */
export function QaAgentRunPanel({
  run,
  section = "all",
}: {
  run: LatestQaRunSummary | null;
  section?: "all" | "blocked" | "bugs";
}) {
  if (!run) {
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

  const blockedEvidence = run.evidence.filter((e) => e.preset === "BLOCKED");
  const bugEvidence = run.evidence.filter((e) => e.preset === "OPEN_BUGS");

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
          empty="No open-bug evidence in the latest sample."
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
