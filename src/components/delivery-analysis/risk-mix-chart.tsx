import {
  RISK_MIX_COLORS,
  RISK_MIX_LABELS,
  type DeliveryAnalysisSnapshot,
} from "@/lib/delivery-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ORDER = ["blocked", "overdue", "bugs", "otherOpen"] as const;

function centerTotalClass(total: number): string {
  const digits = total.toLocaleString().length;
  if (digits <= 2) return "text-2xl";
  if (digits === 3) return "text-xl";
  if (digits === 4) return "text-lg";
  return "text-sm";
}

export function RiskMixChart({
  riskMix,
  compact = false,
}: {
  riskMix: DeliveryAnalysisSnapshot["riskMix"];
  compact?: boolean;
}) {
  const total = ORDER.reduce((n, k) => n + riskMix[k], 0);
  const segments = ORDER.map((key) => {
    const count = riskMix[key];
    const pct = total > 0 ? (count / total) * 100 : 0;
    return { key, count, pct };
  }).filter((s) => s.count > 0);

  const radius = compact ? 32 : 40;
  const circumference = 2 * Math.PI * radius;
  const svgSize = compact ? 96 : 120;

  if (total === 0) {
    return (
      <Card className={cn("h-full", compact && "border-none bg-apricot-wash shadow-none")}>
        <CardHeader className={compact ? "pb-2" : undefined}>
          <CardTitle className={compact ? "text-sm" : "text-base"}>Risk mix</CardTitle>
          {!compact && (
            <CardDescription>
              Open work by risk category · counts at last sync, not live Jira
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className={compact ? "pt-0" : undefined}>
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-elevated/30 p-6 text-center",
              compact && "min-h-[120px] p-4",
              !compact && "min-h-[160px]",
            )}
          >
            <p className="text-sm text-secondary">No open issues in scope</p>
            <p className="text-xs text-muted">
              All projects may be clear, or the selected filter has no open work at last sync.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full", compact && "border-none bg-apricot-wash shadow-none")}>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className={compact ? "text-sm" : "text-base"}>Risk mix</CardTitle>
        <CardDescription className={compact ? "text-xs" : undefined}>
          {compact
            ? "Open work by risk · last Jira sync"
            : "Open work by risk category · counts at last sync, not live Jira"}
        </CardDescription>
      </CardHeader>
      <CardContent className={compact ? "pt-0" : undefined}>
        <div
          className={cn(
            "flex flex-col items-center gap-6 sm:flex-row sm:items-start",
            compact && "gap-4",
          )}
        >
          <div className="relative shrink-0">
            <svg
              width={svgSize}
              height={svgSize}
              viewBox="0 0 100 100"
              className="-rotate-90"
            >
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="var(--metric-track)"
                strokeWidth="12"
              />
              {(() => {
                let offset = 0;
                return segments.map((seg) => {
                const dash = (seg.pct / 100) * circumference;
                const el = (
                  <circle
                    key={seg.key}
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke={RISK_MIX_COLORS[seg.key]}
                    strokeWidth="12"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-((offset / 100) * circumference)}
                    strokeLinecap="butt"
                  />
                );
                offset += seg.pct;
                return el;
              });
              })()}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center px-1 text-center">
              <span className={cn("font-semibold leading-none tabular-nums", centerTotalClass(total))}>
                {total.toLocaleString()}
              </span>
              <span className="mt-0.5 text-[9px] leading-tight text-muted">open</span>
            </div>
          </div>

          <ul className={cn("w-full space-y-2.5", compact && "space-y-1.5")}>
            {segments.map((seg) => (
              <li
                key={seg.key}
                className={cn(
                  "flex items-center justify-between gap-2 text-sm",
                  compact && "text-xs",
                )}
              >
                <span className="flex items-center gap-2 text-secondary">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: RISK_MIX_COLORS[seg.key] }}
                  />
                  {RISK_MIX_LABELS[seg.key]}
                </span>
                <span className="tabular-nums text-primary">
                  {Math.round(seg.pct)}%
                  <span className="ml-1.5 text-xs text-muted">({seg.count})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
