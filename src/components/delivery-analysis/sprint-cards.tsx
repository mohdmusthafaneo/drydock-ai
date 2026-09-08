"use client";

import { JiraIssueLink } from "@/components/delivery-analysis/jira-issue-link";
import { useDeepLinkHighlight } from "@/components/motion/use-deep-link-highlight";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatSprintDay } from "@/lib/format-date";
import { ACTIVE_SPRINTS_HASH } from "@/lib/overview/nav-context";
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
  const { ref, highlightClass } = useDeepLinkHighlight<HTMLDivElement>({
    hash: ACTIVE_SPRINTS_HASH,
    search: { key: "riskFocus", value: "sprint" },
  });

  return (
    <Card
      ref={ref}
      id={ACTIVE_SPRINTS_HASH}
      tabIndex={-1}
      className={cn("scroll-mt-6 self-start outline-none", highlightClass)}
    >
      <CardHeader className="px-4 pt-4 pb-0">
        <CardTitle className="text-base">Active sprints</CardTitle>
        <CardDescription>
          {sprints.length === 1
            ? "Selected sprint progress"
            : "Scrum sprint progress at last sync"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        {sprints.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted">
            No active scrum sprints in scope. Ensure boards are configured and sprint read scope is
            granted.
          </p>
        ) : (
          <div
            className={cn(
              "grid gap-2",
              sprints.length > 1 && "sm:grid-cols-2",
            )}
          >
            {sprints.map((sprint) => (
              <div
                key={`${sprint.projectKey}-${sprint.name}`}
                className={cn(
                  "rounded-lg border border-border-subtle bg-elevated/50 px-3 py-2.5",
                  sprint.severity === "warning" && "border-warning/30",
                  sprint.severity === "critical" && "border-error/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] leading-tight text-muted">{sprint.projectKey}</p>
                    <p className="truncate text-sm font-medium text-primary">{sprint.name}</p>
                  </div>
                  {sprint.severity && sprint.severity !== "info" && (
                    <Badge variant={severityVariant(sprint.severity)} className="shrink-0">
                      {sprint.severity}
                    </Badge>
                  )}
                </div>

                <div className="mt-2 flex items-baseline justify-between gap-2 text-xs text-secondary">
                  <span>
                    {sprint.done} / {sprint.committed} done
                  </span>
                  <span className="tabular-nums font-medium text-primary">{sprint.pct}%</span>
                </div>

                {sprint.daysOverdue != null && sprint.daysOverdue > 0 && (
                  <p className="mt-1 text-xs font-medium text-warning">
                    {sprint.daysOverdue} day{sprint.daysOverdue === 1 ? "" : "s"} past end date
                  </p>
                )}

                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-metric-track">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      sprint.pct < 50 ? "bg-rust/60" : "bg-chart-blue",
                    )}
                    style={{ width: `${Math.min(100, sprint.pct)}%` }}
                  />
                </div>

                {(sprint.startDate || sprint.endDate) && (
                  <p className="mt-1.5 text-[11px] text-muted">
                    {formatSprintDay(sprint.startDate)} → {formatSprintDay(sprint.endDate)}
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
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand hover:underline"
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
