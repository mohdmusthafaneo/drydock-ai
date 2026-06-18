import Link from "next/link";
import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import type { GovernanceSignal } from "@/lib/code-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SEVERITY_VARIANT = {
  info: "default" as const,
  warning: "warning" as const,
  error: "error" as const,
};

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
};

export function GovernanceSignalsPanel({ signals }: { signals: GovernanceSignal[] }) {
  if (signals.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        No governance signals for the current filters.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {signals.map((signal) => {
        const Icon = SEVERITY_ICON[signal.severity];
        return (
          <div
            key={signal.id}
            className={cn(
              "flex gap-3 rounded-lg border border-border-subtle bg-elevated/50 p-4",
              signal.severity === "error" && "border-error/30",
              signal.severity === "warning" && "border-warning/30",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                signal.severity === "error" && "text-error",
                signal.severity === "warning" && "text-warning",
                signal.severity === "info" && "text-chart-blue",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-primary">{signal.title}</p>
                <Badge variant={SEVERITY_VARIANT[signal.severity]}>{signal.severity}</Badge>
              </div>
              <p className="mt-1 text-sm text-secondary">{signal.description}</p>
              <p className="mt-2 text-xs text-muted">{signal.repo}</p>
              {signal.entityUrl ? (
                <a
                  href={signal.entityUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline"
                >
                  {signal.entityLabel}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="mt-2 block text-xs text-secondary">{signal.entityLabel}</span>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted">
        Signals are rule-based estimates. Workflow actions coming in a later phase.{" "}
        <Link href="/approvals" className="text-brand hover:underline">
          Approval center →
        </Link>
      </p>
    </div>
  );
}

export function GovernanceSignalsCard({ signals }: { signals: GovernanceSignal[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Governance signals</CardTitle>
        <CardDescription>Policy-relevant patterns in AI-assisted delivery</CardDescription>
      </CardHeader>
      <CardContent>
        <GovernanceSignalsPanel signals={signals} />
      </CardContent>
    </Card>
  );
}
