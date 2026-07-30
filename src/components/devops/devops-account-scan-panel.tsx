import Link from "next/link";
import type { LatestDevOpsRunSummary } from "@/lib/agent-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function DevOpsAccountScanPanel({
  run,
  awsConnected,
}: {
  run: LatestDevOpsRunSummary | null;
  awsConnected: boolean;
}) {
  if (!run) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AWS account hygiene</CardTitle>
          <CardDescription>
            {awsConnected
              ? "No verified cloud scan yet. Scheduled refreshes (or Refresh all agents) run when AWS credentials are stored."
              : "Connect an AWS assume-role on Integrations. Scheduled scans use those credentials automatically."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
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
              <CardTitle>AWS account hygiene</CardTitle>
              <CardDescription>
                Account {run.accountId} · verified {new Date(run.analyzedAt).toLocaleString()}
                {run.regionsCount != null ? ` · ${run.regionsCount} regions` : ""}
              </CardDescription>
            </div>
            <Badge variant="success">{run.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Resources" value={run.resourcesCount} />
            <Stat label="Findings" value={run.findingsCount} />
            <Stat
              label="Critical"
              value={run.bySeverity.find((s) => s.severity === "CRITICAL")?.count ?? 0}
              tone="risk"
            />
            <Stat
              label="High"
              value={run.bySeverity.find((s) => s.severity === "HIGH")?.count ?? 0}
              tone="attention"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {run.bySeverity.map((s) => (
              <Badge key={s.severity} variant={SEVERITY_BADGE[s.severity] ?? "muted"}>
                {s.severity}: {s.count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top findings</CardTitle>
            <CardDescription>Critical and high first — with recommend-only remediations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inventory mix</CardTitle>
              <CardDescription>Resources discovered in the latest scan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {run.byResourceType.slice(0, 10).map((r) => (
                <div
                  key={r.resourceType}
                  className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-secondary">{r.resourceType}</span>
                  <span className="font-medium text-primary">{r.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {run.warnings.length > 0 && (
            <Card className="border-apricot/30 bg-apricot-wash/20">
              <CardHeader>
                <CardTitle className="text-base">Scan coverage warnings</CardTitle>
                <CardDescription>Partial region or API failures — treat inventory as incomplete</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {run.warnings.slice(0, 8).map((w) => (
                  <p key={w} className="text-xs text-secondary">
                    {w}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "risk" | "attention";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border-subtle bg-elevated px-4 py-3",
        tone === "risk" && "border-rust/25 bg-rust/8",
        tone === "attention" && "border-apricot/30 bg-apricot-wash/30",
      )}
    >
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value.toLocaleString()}</p>
    </div>
  );
}
