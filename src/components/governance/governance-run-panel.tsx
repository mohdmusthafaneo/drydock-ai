import Link from "next/link";
import type { LatestGovernanceRunSummary } from "@/lib/agent-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function GovernanceRunPanel({ run }: { run: LatestGovernanceRunSummary | null }) {
  if (!run) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Code change risk</CardTitle>
          <CardDescription>
            No verified governance analysis yet. Scheduled refreshes populate this when GitHub repos
            are selected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted">
            Advanced:{" "}
            <Link href="/agent-threads/new" className="underline-offset-4 hover:underline">
              run governance agent in Conversations
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  const level = (run.riskLevel ?? "unknown").toLowerCase();
  const badgeVariant =
    level === "high" || level === "critical"
      ? "error"
      : level === "medium"
        ? "warning"
        : "success";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Code change risk</CardTitle>
              <CardDescription>
                {run.repositoryName} · {run.revspec} · verified{" "}
                {new Date(run.analyzedAt).toLocaleString()}
              </CardDescription>
            </div>
            <Badge variant={badgeVariant}>{run.riskLevel ?? run.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Risk score" value={run.riskScore != null ? String(run.riskScore) : "—"} />
            <Stat
              label="Probability"
              value={
                run.probability != null ? `${Math.round(run.probability * 100)}%` : "—"
              }
            />
            <Stat label="Review priority" value={run.reviewPriority ?? "—"} />
            <Stat label="Dead code" value={String(run.deadCodeCount)} />
          </div>
          {run.summary && (
            <p className="mt-4 text-sm text-secondary">{run.summary}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risk drivers</CardTitle>
            <CardDescription>What pushed this window above baseline</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.riskDrivers.length === 0 ? (
              <p className="text-sm text-muted">No drivers recorded.</p>
            ) : (
              run.riskDrivers.map((d) => (
                <div
                  key={d.rank}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2 text-sm"
                >
                  <span className="text-secondary">{d.label ?? `Driver ${d.rank}`}</span>
                  {d.contribution != null && (
                    <span className="shrink-0 font-mono text-xs text-muted">
                      {d.contribution > 0 ? "+" : ""}
                      {d.contribution.toFixed(2)}
                    </span>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Worst files</CardTitle>
            <CardDescription>Hotspots for engineering review</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.worstFiles.map((f) => (
              <div
                key={f.filePath}
                className="rounded-lg border border-border-subtle px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="break-all font-mono text-xs text-primary">{f.filePath}</span>
                  {f.score != null && <Badge variant="muted">score {f.score}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {[
                    f.maxCcn != null ? `CCN ${f.maxCcn}` : null,
                    f.hasTestFile === false ? "no paired test" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {run.deadCode.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dead code candidates</CardTitle>
            <CardDescription>Cleanup-ready findings from the governance agent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.deadCode.map((d) => (
              <div
                key={`${d.rank}-${d.filePath}`}
                className="rounded-lg border border-border-subtle px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-primary">{d.filePath}</span>
                  {d.cleanupReady && <Badge variant="brand">cleanup ready</Badge>}
                  {d.kind && <Badge variant="muted">{d.kind}</Badge>}
                </div>
                {d.reason && <p className="mt-1 text-xs text-muted">{d.reason}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
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
