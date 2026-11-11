import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CursorAiKpis, CursorAiRoi } from "@/lib/cursor-api/types";

function formatPct(value: number | null): string {
  if (value == null) return "—";
  return `${value}%`;
}

export function AiRoiCard({
  roi,
  kpis,
}: {
  roi: CursorAiRoi;
  kpis: CursorAiKpis;
}) {
  return (
    <Card data-slot="ai-roi-card">
      <CardHeader>
        <CardTitle>ROI this sprint</CardTitle>
        <CardDescription>
          How the headline return was built — acceptance, reach, and cost inputs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <Stat
            label="Agent accept rate"
            value={formatPct(kpis.agentAcceptRatePct)}
            hint={`${kpis.agentAccepted.toLocaleString()} / ${kpis.agentSuggested.toLocaleString()} diffs`}
          />
          <Stat
            label="Tab accept rate"
            value={formatPct(kpis.tabAcceptRatePct)}
            hint={`${kpis.tabAccepts.toLocaleString()} / ${kpis.tabSuggestions.toLocaleString()} suggestions`}
          />
          <Stat
            label="Latest DAU"
            value={
              kpis.latestDau == null ? "—" : kpis.latestDau.toLocaleString()
            }
            hint={
              kpis.latestDauDate
                ? `As of ${kpis.latestDauDate}`
                : "No DAU samples yet"
            }
          />
          <Stat
            label="Sprint commits tracked"
            value={
              kpis.aiCommitsTracked == null
                ? "—"
                : kpis.aiCommitsTracked.toLocaleString()
            }
            hint="Merged PRs in this sprint window"
          />
        </div>

        <div className="rounded-[9px] border border-border-soft bg-elevated/40 px-3 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-faint">
            Calculation
          </p>
          <dl className="mt-2 grid gap-1.5 text-[13px]">
            <CalcRow
              label="AI-attributed lines"
              value={roi.aiLinesAccepted.toLocaleString()}
            />
            <CalcRow
              label="Blended eng rate"
              value={`$${roi.blendedHourlyUsd}/hr`}
            />
            <CalcRow
              label="Hours implied"
              value={`${roi.engHoursSaved.toLocaleString()}h`}
            />
            <CalcRow
              label="Cost avoided"
              value={`$${roi.engCostSavedUsd.toLocaleString()}`}
            />
            <CalcRow
              label="AI cost"
              value={`$${roi.tokenSpendUsd.toFixed(2)}`}
            />
            <CalcRow
              label="Net value"
              value={`${roi.netValueUsd >= 0 ? "+" : "−"}$${Math.abs(roi.netValueUsd).toLocaleString()}`}
              emphasis
            />
          </dl>
        </div>

        <p className="text-[12px] leading-snug text-muted">{roi.caption}</p>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[9px] border border-border-soft px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold tabular-nums text-ink">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-faint">{hint}</p> : null}
    </div>
  );
}

function CalcRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd
        className={
          emphasis
            ? "font-semibold tabular-nums text-ink"
            : "tabular-nums text-secondary"
        }
      >
        {value}
      </dd>
    </div>
  );
}
