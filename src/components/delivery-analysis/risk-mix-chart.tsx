import {
  RISK_MIX_COLORS,
  RISK_MIX_LABELS,
  type DeliveryAnalysisSnapshot,
} from "@/lib/delivery-analysis/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ORDER = ["blocked", "overdue", "bugs", "otherOpen"] as const;

export function RiskMixChart({
  riskMix,
}: {
  riskMix: DeliveryAnalysisSnapshot["riskMix"];
}) {
  const total = ORDER.reduce((n, k) => n + riskMix[k], 0);
  const segments = ORDER.map((key) => {
    const count = riskMix[key];
    const pct = total > 0 ? (count / total) * 100 : 0;
    return { key, count, pct };
  }).filter((s) => s.count > 0);

  let offset = 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Risk mix</CardTitle>
        <CardDescription>
          Open work by risk category · counts at last sync, not live Jira
        </CardDescription>
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
                    stroke={RISK_MIX_COLORS[seg.key]}
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
              <span className="text-2xl font-semibold">{total.toLocaleString()}</span>
              <span className="text-[10px] text-muted">open issues</span>
            </div>
          </div>

          <ul className="w-full space-y-2.5">
            {segments.map((seg) => (
              <li key={seg.key} className="flex items-center justify-between gap-2 text-sm">
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
