import Link from "next/link";
import type { CodeHealthPageView } from "@/lib/agent-analysis/presentation";
import type { LatestGovernanceRunSummary } from "@/lib/agent-analysis/types";
import { fileBasename, humanizeSignalLabel } from "@/lib/agent-analysis/presentation";
import { Badge } from "@/components/ui/badge";

/**
 * Detail-only governance evidence. Executive summary lives in AgentPageShell.
 */
export function GovernanceRunPanel({
  run,
  section = "all",
}: {
  run: LatestGovernanceRunSummary | null;
  section?: "all" | "drivers" | "files" | "dead-code" | "notes";
}) {
  if (!run) {
    return (
      <div className="space-y-2 text-sm text-secondary">
        <p>
          No verified governance analysis yet. Scheduled refreshes populate this when GitHub repos
          are selected.
        </p>
        <p className="text-xs text-muted">
          Advanced:{" "}
          <Link href="/agent-threads/new" className="underline-offset-4 hover:underline">
            run governance agent in Conversations
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(section === "all" || section === "notes") && run.summary ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Agent notes</p>
          <p className="font-mono text-xs text-muted">{run.summary}</p>
        </div>
      ) : null}

      {(section === "all" || section === "drivers") && (
        <div className="space-y-2">
          {section === "all" ? (
            <p className="text-sm font-medium text-ink">Risk drivers</p>
          ) : null}
          {run.riskDrivers.length === 0 ? (
            <p className="text-sm text-muted">No drivers recorded.</p>
          ) : (
            run.riskDrivers.map((d) => (
              <div
                key={d.rank}
                className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="text-secondary">
                  {humanizeSignalLabel(d.label ?? `Driver ${d.rank}`)}
                </span>
                {d.contribution != null && (
                  <span className="shrink-0 text-xs text-muted">
                    {d.contribution > 0 ? "+" : ""}
                    {d.contribution.toFixed(2)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {(section === "all" || section === "files") && (
        <div className="space-y-2">
          {section === "all" ? (
            <p className="text-sm font-medium text-ink">Worst files</p>
          ) : null}
          {run.worstFiles.map((f) => (
            <div
              key={f.filePath}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-all text-xs text-primary">{f.filePath}</span>
                {f.score != null && <Badge variant="muted">score {f.score}</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted">
                {[
                  f.maxCcn != null ? `Complexity ${f.maxCcn}` : null,
                  f.hasTestFile === false ? "no paired test" : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>
          ))}
        </div>
      )}

      {(section === "all" || section === "dead-code") && run.deadCode.length > 0 && (
        <div className="space-y-2">
          {section === "all" ? (
            <p className="text-sm font-medium text-ink">Dead code candidates</p>
          ) : null}
          {run.deadCode.map((d) => (
            <div
              key={`${d.rank}-${d.filePath}`}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-primary">
                  {d.filePath ? fileBasename(d.filePath) : "Unknown file"}
                </span>
                {d.cleanupReady && <Badge variant="brand">cleanup ready</Badge>}
                {d.kind && <Badge variant="muted">{d.kind.replace(/_/g, " ")}</Badge>}
              </div>
              {d.reason && <p className="mt-1 text-xs text-muted">{d.reason}</p>}
              {d.filePath && (
                <p className="mt-1 break-all text-[11px] text-muted">{d.filePath}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CodeHealthHotspots({
  hotspots,
  drivers,
}: {
  hotspots: CodeHealthPageView["topHotspots"];
  drivers: CodeHealthPageView["riskDrivers"];
}) {
  if (hotspots.length === 0 && drivers.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {drivers.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-pure-white p-5 shadow-[var(--shadow)]">
          <p className="font-display text-[17px] text-ink">What is driving risk</p>
          <ul className="mt-3 space-y-2">
            {drivers.slice(0, 5).map((d, i) => (
              <li key={`${d.label}-${i}`} className="text-sm text-secondary">
                {d.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hotspots.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-border bg-pure-white p-5 shadow-[var(--shadow)]">
          <p className="font-display text-[17px] text-ink">Top hotspots</p>
          <ul className="mt-3 space-y-3">
            {hotspots.map((f) => (
              <li key={f.filePath} className="text-sm">
                <p className="font-medium text-primary">{f.basename}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {[
                    f.score != null ? `Score ${f.score}` : null,
                    f.hasTestFile === false ? "No paired test" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
