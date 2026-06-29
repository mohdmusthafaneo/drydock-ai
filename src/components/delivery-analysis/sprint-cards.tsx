import { JiraIssueLink } from "@/components/delivery-analysis/jira-issue-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DeliveryAnalysisSprintRow } from "@/lib/delivery-analysis/types";

type Props = {
  sprints: DeliveryAnalysisSprintRow[];
  siteUrl?: string;
};

function severityVariant(severity?: DeliveryAnalysisSprintRow["severity"]) {
  if (severity === "critical") return "error" as const;
  if (severity === "warning") return "warning" as const;
  return "default" as const;
}

export function SprintCards({ sprints, siteUrl }: Props) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Active sprints</CardTitle>
        <CardDescription>Scrum sprint progress at last sync</CardDescription>
      </CardHeader>
      <CardContent>
        {sprints.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            No active scrum sprints in scope. Ensure boards are configured and sprint read scope is
            granted.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {sprints.map((sprint) => (
              <div
                key={`${sprint.projectKey}-${sprint.name}`}
                className={cn(
                  "rounded-lg border border-border-subtle bg-elevated/50 p-4",
                  sprint.severity === "warning" && "border-warning/30",
                  sprint.severity === "critical" && "border-error/30",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted">{sprint.projectKey}</p>
                    <p className="font-medium text-primary">{sprint.name}</p>
                  </div>
                  {sprint.severity && sprint.severity !== "info" && (
                    <Badge variant={severityVariant(sprint.severity)}>{sprint.severity}</Badge>
                  )}
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-secondary">
                    <span>
                      {sprint.done} / {sprint.committed} done
                    </span>
                    <span className="tabular-nums font-medium">{sprint.pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-metric-track">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        sprint.pct < 50 ? "bg-rust/60" : "bg-chart-blue",
                      )}
                      style={{ width: `${Math.min(100, sprint.pct)}%` }}
                    />
                  </div>
                </div>
                {(sprint.startDate || sprint.endDate) && (
                  <p className="mt-2 text-xs text-muted">
                    {sprint.startDate ?? "?"} → {sprint.endDate ?? "?"}
                  </p>
                )}
                <JiraIssueLink
                  href={
                    sprint.jiraUrl ??
                    (siteUrl
                      ? `${siteUrl.replace(/\/$/, "")}/jira/software/projects/${sprint.projectKey}/boards`
                      : undefined)
                  }
                  label={sprint.jiraUrl ? "View issues in Jira" : "Open in Jira"}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
