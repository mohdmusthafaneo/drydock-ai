import Link from "next/link";
import type { LatestProductivityRunSummary } from "@/lib/agent-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ProductivityRunPanel({
  run,
}: {
  run: LatestProductivityRunSummary | null;
}) {
  if (!run) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Engineering productivity</CardTitle>
          <CardDescription>
            No verified productivity analysis yet. Scheduled refreshes populate this when GitHub
            repos are selected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted">
            Advanced:{" "}
            <Link href="/agent-threads/new" className="underline-offset-4 hover:underline">
              run productivity agent in Conversations
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Engineering productivity</CardTitle>
              <CardDescription>
                {run.repositoryName} · {run.branch} · verified{" "}
                {new Date(run.analyzedAt).toLocaleString()}
              </CardDescription>
            </div>
            <Badge variant="success">{run.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Commits" value={String(run.totalCommits ?? "—")} />
            <Stat label="Files touched" value={String(run.filesTouched ?? "—")} />
            <Stat label="PRs merged" value={String(run.prsMerged ?? "—")} />
            <Stat
              label="Feat/fix ratio"
              value={run.featFixRatio != null ? run.featFixRatio.toFixed(2) : "—"}
            />
          </div>
          {run.tlDr && <p className="mt-4 text-sm text-secondary">{run.tlDr}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {run.strongestSignals.map((s) => (
              <Badge key={s} variant="brand">
                {s}
              </Badge>
            ))}
            {run.weakestSignals.map((s) => (
              <Badge key={s} variant="warning">
                {s}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contributors</CardTitle>
            <CardDescription>Share of commits — watch bus factor above ~50%</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.contributors.map((c) => (
              <div
                key={c.authorName}
                className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-primary">{c.authorName}</p>
                  <p className="text-xs text-muted">
                    {c.commits} commits · net {c.net}
                  </p>
                </div>
                <Badge variant={c.sharePct >= 50 ? "warning" : "muted"}>
                  {c.sharePct}%
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commit mix & weekly volume</CardTitle>
            <CardDescription>Type breakdown and ISO-week cadence</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {run.commitTypes.map((t) => (
                <div
                  key={t.commitType}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-secondary">{t.commitType}</span>
                  <span className="text-muted">
                    {t.count} · {t.sharePct}%
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-1 border-t border-border-subtle pt-3">
              {run.weeklyVolume.slice(-12).map((w) => (
                <div
                  key={w.isoWeek}
                  className="flex items-center justify-between font-mono text-xs text-muted"
                >
                  <span>{w.isoWeek}</span>
                  <span>{w.commits}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-elevated px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
    </div>
  );
}
