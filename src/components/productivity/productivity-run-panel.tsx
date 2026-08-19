import Link from "next/link";
import type { ProductivityPageView } from "@/lib/agent-analysis/presentation";
import type { LatestProductivityRunSummary } from "@/lib/agent-analysis/types";
import { humanizeSignalLabel } from "@/lib/agent-analysis/presentation";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

/**
 * Detail-only productivity tables. Executive summary lives in AgentPageShell.
 */
export function ProductivityRunPanel({
  run,
  section = "all",
}: {
  run: LatestProductivityRunSummary | null;
  section?: "all" | "contributors" | "commits" | "signals";
}) {
  if (!run) {
    return (
      <div className="space-y-2 text-sm text-secondary">
        <p>
          No verified productivity analysis yet. Scheduled refreshes populate this when GitHub
          repos are selected.
        </p>
        <p className="text-xs text-muted">
          Advanced:{" "}
          <Link href="/agent-threads/new" className="underline-offset-4 hover:underline">
            run productivity agent in Conversations
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(section === "all" || section === "signals") && (
        <div className="space-y-2">
          {run.tlDr ? <p className="text-sm text-secondary">{run.tlDr}</p> : null}
          <div className="flex flex-wrap gap-2">
            {run.strongestSignals.map((s) => (
              <Badge key={s} variant="brand">
                {humanizeSignalLabel(s)}
              </Badge>
            ))}
            {run.weakestSignals.map((s) => (
              <Badge key={s} variant="warning">
                {humanizeSignalLabel(s)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {(section === "all" || section === "contributors") && (
        <div className="space-y-2">
          {section === "all" ? (
            <p className="text-sm font-medium text-ink">Contributors</p>
          ) : null}
          {run.contributors.map((c) => (
            <div
              key={c.authorName}
              className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-primary">{c.authorName}</p>
                <p className="text-xs text-muted">{c.commits} commits</p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Badge variant={c.sharePct >= 50 ? "warning" : "muted"}>
                        {c.sharePct}%
                      </Badge>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p className="text-xs font-medium">Source: repowise · commit attribution</p>
                    <p className="text-xs">
                      {c.sharePct >= 50
                        ? "High risk — one person owns most commits. Rotation recommended."
                        : c.sharePct >= 40
                          ? "Moderate concentration — consider pairing."
                          : "Within healthy range."}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ))}
        </div>
      )}

      {(section === "all" || section === "commits") && (
        <div className="space-y-2">
          {section === "all" ? (
            <p className="text-sm font-medium text-ink">Commit mix</p>
          ) : null}
          {run.commitTypes.map((t) => (
            <div key={t.commitType} className="flex items-center justify-between text-sm">
              <span className="text-secondary">{humanizeSignalLabel(t.commitType)}</span>
              <span className="text-muted">
                {t.count} · {t.sharePct}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductivitySignals({
  strongest,
  weakest,
}: {
  strongest: ProductivityPageView["strongestSignals"];
  weakest: ProductivityPageView["weakestSignals"];
}) {
  if (strongest.length === 0 && weakest.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {strongest.map((s) => (
        <Badge key={`s-${s}`} variant="brand">
          {s}
        </Badge>
      ))}
      {weakest.map((s) => (
        <Badge key={`w-${s}`} variant="warning">
          {s}
        </Badge>
      ))}
    </div>
  );
}
