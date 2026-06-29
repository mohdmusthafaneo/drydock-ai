"use client";

import { AlertTriangle } from "lucide-react";
import type { CodeAnalysisAiRisk } from "@/lib/code-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  aiRisk: CodeAnalysisAiRisk;
};

export function AiRiskCard({ aiRisk }: Props) {
  const hasRisk =
    aiRisk.highRiskCount > 0 ||
    aiRisk.unreviewedAiPrs > 0 ||
    aiRisk.unlinkedAiPrs > 0;

  return (
    <Card
      className={cn(
        hasRisk && "border-warning/40 bg-warning-muted/20",
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          {hasRisk && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
          <div>
            <CardTitle className="text-base">AI code risk</CardTitle>
            <CardDescription>
              Introduction risk from AI-generated and AI-assisted changes in this period
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-primary">
          <span className="font-semibold tabular-nums">{aiRisk.aiLinesPct}%</span> of this release
          is AI-generated or AI-assisted
          {hasRisk ? (
            <>
              {" "}
              —{" "}
              <span className="font-medium text-warning">
                {aiRisk.highRiskCount} high-risk area{aiRisk.highRiskCount === 1 ? "" : "s"}
              </span>
              , {aiRisk.unreviewedAiPrs} unreviewed AI PR
              {aiRisk.unreviewedAiPrs === 1 ? "" : "s"}, {aiRisk.unlinkedAiPrs} untracked to Jira
            </>
          ) : (
            " — no high-risk signals in this window"
          )}
          .
        </p>
        {aiRisk.avgCompletionScore != null && (
          <p className="mt-2 text-xs text-secondary">
            Avg ticket completion score:{" "}
            <span className="font-medium tabular-nums text-primary">
              {aiRisk.avgCompletionScore}%
            </span>{" "}
            (linked PRs vs Jira scope)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
