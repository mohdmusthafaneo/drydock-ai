import Link from "next/link";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Variant = "loading" | "missing" | "error" | "empty_filter";

type Props = {
  variant: Variant;
  projectKeys?: string[];
  onRetry?: () => void;
  filterProjectKey?: string | null;
};

export function SnapshotUnavailable({
  variant,
  projectKeys = [],
  onRetry,
  filterProjectKey,
}: Props) {
  if (variant === "loading") {
    return (
      <Card className="border-dashed border-border">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted" />
          <p className="text-sm text-secondary">Loading delivery snapshot…</p>
        </CardContent>
      </Card>
    );
  }

  const title =
    variant === "missing"
      ? "No delivery snapshot available"
      : variant === "error"
        ? "Could not load delivery snapshot"
        : "No data for selected filters";

  const description =
    variant === "missing"
      ? "Jira is connected but no synced delivery data was found for this organization."
      : variant === "error"
        ? "The snapshot request failed. Your Jira connection may still be valid."
        : filterProjectKey
          ? `No metrics for project ${filterProjectKey} in the last sync.`
          : "Nothing matched the current filters.";

  const reasons =
    variant === "missing"
      ? [
          "Jira has not been synced since projects were selected — run Sync on Integrations.",
          "The last sync failed or returned no projects (check Integrations for errors).",
          "Selected projects were removed or are inaccessible with the current Jira token.",
        ]
      : variant === "error"
        ? [
            "Temporary server or network issue — try again.",
            "Session expired — refresh the page and sign in again.",
            "Jira metadata may be incomplete — sync again on Integrations.",
          ]
        : [
            "The project may not have been included in the last sync.",
            "Clear the project filter to see portfolio-wide metrics.",
            "Sync Jira again if projects were recently added.",
          ];

  return (
    <Card className="border-dashed border-warning/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
          <AlertCircle className="h-6 w-6 text-warning" />
        </div>
        <CardTitle className="mt-4">{title}</CardTitle>
        <CardDescription className="mx-auto max-w-md">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pb-8">
        <div className="mx-auto max-w-md rounded-lg border border-border-subtle bg-elevated/30 px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Possible reasons
          </p>
          <ul className="list-inside list-disc space-y-1.5 text-sm text-secondary">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>

        {projectKeys.length > 0 && variant !== "empty_filter" && (
          <p className="text-center text-xs text-muted">
            Selected projects: {projectKeys.join(", ")}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          )}
          {(variant === "missing" || variant === "error") && (
            <Button asChild variant="brown" size="sm">
              <Link href="/integrations">Go to integrations</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
