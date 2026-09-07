import Link from "next/link";
import type { ClusteredFinding, LatestDevOpsRunSummary } from "@/lib/agent-analysis/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SEVERITY_BADGE: Record<string, "error" | "warning" | "muted" | "brand"> = {
  CRITICAL: "error",
  HIGH: "warning",
  MEDIUM: "warning",
  LOW: "muted",
  INFO: "brand",
};

/**
 * Detail-only AWS scan content. Executive hero lives in AgentPageShell.
 */
export function DevOpsAccountScanPanel({
  run,
  awsConnected,
  section = "all",
}: {
  run: LatestDevOpsRunSummary | null;
  awsConnected: boolean;
  section?: "all" | "coverage" | "findings";
}) {
  if (!run) {
    return (
      <div className="space-y-3 text-sm text-secondary">
        <p>
          {awsConnected
            ? "No verified cloud scan yet. Scheduled refreshes (or Refresh all agents) run when AWS credentials are stored."
            : "Connect an AWS assume-role on Integrations. Scheduled scans use those credentials automatically."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {!awsConnected && (
            <Button asChild variant="brand" size="sm">
              <Link href="/integrations">Configure AWS role</Link>
            </Button>
          )}
          <p className="text-xs text-muted">
            Advanced:{" "}
            <Link href="/agent-threads/new" className="underline-offset-4 hover:underline">
              run DevOps agent in Conversations
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(section === "all" || section === "findings") && (
        <div className="space-y-3">
          {run.topFindings.length === 0 ? (
            <p className="text-sm text-muted">No findings in the latest scan.</p>
          ) : (
            run.topFindings.slice(0, 12).map((f) => (
              <div
                key={f.id}
                className="rounded-lg border border-border-subtle bg-elevated/60 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-primary">{f.title}</span>
                  <Badge variant={SEVERITY_BADGE[f.severity] ?? "muted"}>{f.severity}</Badge>
                </div>
                <p className="mt-1 text-secondary">{f.description}</p>
                <p className="mt-2 text-xs text-muted">
                  <span className="font-medium text-ash">Recommend: </span>
                  {f.recommendation}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {(section === "all" || section === "coverage") && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Inventory mix</p>
            {run.byResourceType.slice(0, 10).map((r) => (
              <div
                key={r.resourceType}
                className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2 text-sm"
              >
                <span className="text-secondary">{r.resourceType.replace(/_/g, " ")}</span>
                <span className="font-medium text-primary">{r.count}</span>
              </div>
            ))}
          </div>

          {run.warnings.length > 0 && (
            <div className="space-y-2 rounded-xl border border-apricot/30 bg-apricot-wash/20 p-3">
              <p className="text-sm font-medium text-ink">
                Partial coverage ({run.warnings.length})
              </p>
              <p className="text-xs text-muted">
                Some regions or APIs did not respond fully — treat inventory as incomplete.
              </p>
              <p className="text-xs text-secondary">
                {run.warnings.length} coverage warning
                {run.warnings.length === 1 ? "" : "s"} recorded in the agent run log.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ClusteredFindingsList({
  findings,
  className,
}: {
  findings: ClusteredFinding[];
  className?: string;
}) {
  if (findings.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-border-subtle bg-pure-white p-5 shadow-[var(--shadow)]",
        className,
      )}
    >
      <p className="font-display text-[17px] text-ink">Top findings</p>
      <p className="mt-1 text-[13px] text-graphite">
        Grouped by check — identical issues collapsed with a shared remediation.
      </p>
      <ul className="mt-4 space-y-3">
        {findings.map((f) => (
          <li
            key={f.checkId}
            className="rounded-xl border border-border-subtle bg-elevated/50 px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-primary">
                {f.title}
                {f.count > 1 ? (
                  <span className="ml-2 text-sm font-normal text-muted">×{f.count}</span>
                ) : null}
              </p>
              <Badge variant={SEVERITY_BADGE[f.severity] ?? "muted"}>{f.severity}</Badge>
            </div>
            <p className="mt-1 text-sm text-secondary">{f.description}</p>
            <p className="mt-2 text-xs text-muted">
              <span className="font-medium text-ash">Recommend: </span>
              {f.recommendation}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
