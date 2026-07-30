import Link from "next/link";
import type { LatestQaRunSummary } from "@/lib/agent-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PRESET_LABEL: Record<string, string> = {
  OPEN_BUGS: "Open bugs",
  BLOCKED: "Blocked",
  OPEN: "Open",
  DONE: "Done",
};

export function QaAgentRunPanel({ run }: { run: LatestQaRunSummary | null }) {
  if (!run) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Latest QA agent scan</CardTitle>
          <CardDescription>
            No verified QA analysis yet. Scheduled refreshes (or Refresh all agents) populate this
            when Jira projects are connected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted">
            Advanced:{" "}
            <Link href="/agent-threads/new" className="underline-offset-4 hover:underline">
              run QA agent in Conversations
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  const presets = [
    { key: "OPEN_BUGS", count: run.openBugs },
    { key: "BLOCKED", count: run.blocked },
    { key: "OPEN", count: run.open },
    { key: "DONE", count: run.done },
  ] as const;

  const blockedEvidence = run.evidence.filter((e) => e.preset === "BLOCKED");
  const bugEvidence = run.evidence.filter((e) => e.preset === "OPEN_BUGS");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Latest QA agent scan</CardTitle>
              <CardDescription>
                Verified {new Date(run.analyzedAt).toLocaleString()}
                {run.projectKeys.length > 0
                  ? ` · projects ${run.projectKeys.join(", ")}`
                  : null}
              </CardDescription>
            </div>
            <Badge variant="success">{run.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {presets.map((p) => (
              <div
                key={p.key}
                className="rounded-xl border border-border-subtle bg-elevated px-4 py-3"
              >
                <p className="text-xs text-muted">{PRESET_LABEL[p.key] ?? p.key}</p>
                <p className="mt-1 font-display text-2xl text-ink">{p.count.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <EvidenceCard
          title="Blocked issues"
          description="Sample evidence from the latest scan — prioritize these before release."
          rows={blockedEvidence}
          empty="No blocked issues in the evidence sample."
        />
        <EvidenceCard
          title="Open bugs"
          description="Representative open bugs from the QA agent evidence set."
          rows={bugEvidence}
          empty="No open-bug evidence in the latest sample."
        />
      </div>
    </div>
  );
}

function EvidenceCard({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: LatestQaRunSummary["evidence"];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
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
      </CardContent>
    </Card>
  );
}
