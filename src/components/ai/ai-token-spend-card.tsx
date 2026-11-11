import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CursorTokenSpend } from "@/lib/cursor-api/types";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function AiTokenSpendCard({ spend }: { spend: CursorTokenSpend }) {
  return (
    <Card data-slot="ai-token-spend">
      <CardHeader>
        <CardTitle>Token expenditure</CardTitle>
        <CardDescription>
          Coverage across Jira work items that saw AI-assisted changes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Total tokens" value={formatTokens(spend.totalTokens)} />
          <Metric label="Spend" value={`$${spend.totalSpendUsd.toFixed(2)}`} />
          <Metric
            label="Ticket coverage"
            value={`${spend.coveragePct}%`}
            hint={`${spend.ticketsCovered} / ${spend.ticketsTouched} keys`}
          />
          <Metric
            label="In / out"
            value={`${formatTokens(spend.inputTokens)} / ${formatTokens(spend.outputTokens)}`}
          />
        </div>

        <ul className="space-y-2.5">
          {spend.byModel.map((row) => (
            <li key={row.model} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
              <span className="truncate text-[13px] text-secondary">{row.model}</span>
              <span className="text-[12px] font-medium tabular-nums text-ink">
                {formatTokens(row.tokens)} · ${row.spendUsd.toFixed(2)}
              </span>
              <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-elevated">
                <div
                  className="h-full rounded-full bg-blue"
                  style={{ width: `${Math.max(row.sharePct, 2)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Metric({
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
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-[16px] font-semibold tracking-[-0.3px] text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-faint">{hint}</p> : null}
    </div>
  );
}
