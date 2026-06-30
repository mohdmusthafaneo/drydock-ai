"use client";

import { Users } from "lucide-react";
import type { CodeAnalysisAccountability } from "@/lib/code-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  accountability: CodeAnalysisAccountability;
};

export function AccountabilityCard({ accountability }: Props) {
  const hasGaps =
    accountability.highRiskPrsWithoutReviewer > 0 ||
    accountability.unownedHighCostPaths > 0 ||
    accountability.unnamedReviewerAiPrs > 0;

  return (
    <Card className={cn(hasGaps && "border-warning/40 bg-warning-muted/20")}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          {hasGaps && <Users className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
          <div>
            <CardTitle className="text-base">Code accountability</CardTitle>
            <CardDescription>
              Ownership and review gaps for AI-attributed changes in this period
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasGaps ? (
          <ul className="space-y-1 text-sm text-primary">
            {accountability.highRiskPrsWithoutReviewer > 0 && (
              <li>
                <span className="font-semibold tabular-nums">
                  {accountability.highRiskPrsWithoutReviewer}
                </span>{" "}
                high-risk AI PR
                {accountability.highRiskPrsWithoutReviewer === 1 ? "" : "s"} merged with no named
                reviewer
              </li>
            )}
            {accountability.unnamedReviewerAiPrs > 0 && (
              <li>
                <span className="font-semibold tabular-nums">
                  {accountability.unnamedReviewerAiPrs}
                </span>{" "}
                AI PR{accountability.unnamedReviewerAiPrs === 1 ? "" : "s"} with no named approver
                on record
              </li>
            )}
            {accountability.unownedHighCostPaths > 0 && (
              <li>
                <span className="font-semibold tabular-nums">
                  {accountability.unownedHighCostPaths}
                </span>{" "}
                high-churn path
                {accountability.unownedHighCostPaths === 1 ? "" : "s"} without a clear owner
              </li>
            )}
          </ul>
        ) : (
          <p className="text-sm text-secondary">
            Reviewers and file owners are attributed for AI changes in this window.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
