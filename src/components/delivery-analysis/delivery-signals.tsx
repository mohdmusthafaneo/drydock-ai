import Link from "next/link";
import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import type { JiraDeliverySignal } from "@/lib/jira-delivery-health";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SEVERITY_VARIANT = {
  info: "default" as const,
  warning: "warning" as const,
  critical: "error" as const,
};

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertTriangle,
};

export function DeliverySignalsPanel({
  signals,
  siteUrl,
}: {
  signals: JiraDeliverySignal[];
  siteUrl?: string;
}) {
  if (signals.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        No delivery signals for the current filters.
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
              signal.severity === "critical" && "border-error/30",
              signal.severity === "warning" && "border-warning/30",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                signal.severity === "critical" && "text-error",
                signal.severity === "warning" && "text-warning",
                signal.severity === "info" && "text-enterprise",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-primary">{signal.label}</p>
                <Badge variant={SEVERITY_VARIANT[signal.severity]}>{signal.severity}</Badge>
                <Badge variant="muted" className="text-[10px]">
                  {signal.category}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-secondary">{signal.value}</p>
              {siteUrl && (
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline"
                >
                  Open in Jira
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted">
        Signals are rule-based at last sync. Recommendations from signals coming in a later phase.{" "}
        <Link href="/integrations" className="text-brand hover:underline">
          Manage Jira sync →
        </Link>
      </p>
    </div>
  );
}

export function DeliverySignalsCard({
  signals,
  siteUrl,
}: {
  signals: JiraDeliverySignal[];
  siteUrl?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Delivery signals</CardTitle>
        <CardDescription>Governance-relevant patterns in Jira delivery</CardDescription>
      </CardHeader>
      <CardContent>
        <DeliverySignalsPanel signals={signals} siteUrl={siteUrl} />
      </CardContent>
    </Card>
  );
}
