import { cn } from "@/lib/utils";
import type { CodeAnalysisKpis } from "@/lib/code-analysis/types";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Minus, ShieldCheck } from "lucide-react";

function DeltaBadge({ delta, suffix = "pts" }: { delta: number; suffix?: string }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted">
        <Minus className="h-3 w-3" />0 {suffix}
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        up ? "text-mvp" : "text-success",
      )}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta)} {suffix}
    </span>
  );
}

const KPI_ITEMS: {
  key: keyof CodeAnalysisKpis;
  label: string;
  suffix?: string;
  deltaKey?: keyof CodeAnalysisKpis;
  isReview?: boolean;
}[] = [
  { key: "aiLinesPct", label: "AI-assisted lines", suffix: "%", deltaKey: "aiLinesPctDelta" },
  { key: "aiCommitsPct", label: "AI-assisted commits", suffix: "%", deltaKey: "aiCommitsPctDelta" },
  { key: "aiPrsPct", label: "AI-assisted PRs", suffix: "%", deltaKey: "aiPrsPctDelta" },
  { key: "reviewCoverageOnAiPrsPct", label: "Review coverage on AI PRs", suffix: "%", isReview: true },
];

export function KpiStrip({ kpis }: { kpis: CodeAnalysisKpis }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KPI_ITEMS.map((item) => {
        const value = kpis[item.key];
        const delta = item.deltaKey ? kpis[item.deltaKey] : 0;
        return (
          <Card key={item.key} className="min-w-0">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardDescription>{item.label}</CardDescription>
              {item.isReview && <ShieldCheck className="h-4 w-4 shrink-0 text-enterprise" />}
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight">
                {value}
                {item.suffix}
              </p>
              {!item.isReview && item.deltaKey && (
                <p className="mt-1.5 text-secondary">
                  vs prior period · <DeltaBadge delta={delta} />
                </p>
              )}
              {item.isReview && (
                <p className="mt-1.5 text-xs text-secondary">High-AI PRs with ≥1 approval</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
