import { cn } from "@/lib/utils";
import {
  ATTRIBUTION_COLORS,
  ATTRIBUTION_LABELS,
  type AiAttribution,
  type CodeAnalysisSnapshot,
} from "@/lib/code-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ORDER: AiAttribution[] = ["human_only", "ai_assisted", "ai_generated", "unknown"];

export function AttributionChart({
  attribution,
}: {
  attribution: CodeAnalysisSnapshot["attribution"];
}) {
  const totalLines = ORDER.reduce((n, k) => n + attribution[k].lines, 0);
  const segments = ORDER.map((key) => {
    const lines = attribution[key].lines;
    const pct = totalLines > 0 ? (lines / totalLines) * 100 : 0;
    return { key, lines, pct, count: attribution[key].count };
  }).filter((s) => s.lines > 0 || s.key !== "unknown");

  let offset = 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Attribution breakdown</CardTitle>
        <CardDescription>Share of added lines by classification</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <svg width="120" height="120" viewBox="0 0 100 100" className="-rotate-90">
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="var(--metric-track)"
                strokeWidth="12"
              />
              {segments.map((seg) => {
                const dash = (seg.pct / 100) * circumference;
                const el = (
                  <circle
                    key={seg.key}
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke={ATTRIBUTION_COLORS[seg.key]}
                    strokeWidth="12"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-((offset / 100) * circumference)}
                    strokeLinecap="butt"
                  />
                );
                offset += seg.pct;
                return el;
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold">{totalLines.toLocaleString()}</span>
              <span className="text-[10px] text-muted">lines added</span>
            </div>
          </div>

          <ul className="w-full space-y-2.5">
            {segments.map((seg) => (
              <li key={seg.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-secondary">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: ATTRIBUTION_COLORS[seg.key] }}
                  />
                  {ATTRIBUTION_LABELS[seg.key]}
                </span>
                <span className="tabular-nums text-primary">
                  {Math.round(seg.pct)}%
                  <span className="ml-1.5 text-xs text-muted">({seg.count} commits)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function attributionBadgeClass(attribution: AiAttribution): string {
  return cn(
    attribution === "human_only" && "bg-hover text-secondary",
    attribution === "ai_assisted" && "bg-enterprise-muted text-enterprise",
    attribution === "ai_generated" && "bg-mvp-muted text-mvp",
    attribution === "unknown" && "border border-dashed border-border text-muted",
  );
}
