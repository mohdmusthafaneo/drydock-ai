import Link from "next/link";
import {
  RISK_MIX_COLORS,
  RISK_MIX_LABELS,
  type DeliveryAnalysisSnapshot,
} from "@/lib/delivery-analysis/types";
import { cn } from "@/lib/utils";

const ORDER = ["blocked", "overdue", "bugs", "otherOpen"] as const;

type Props = {
  riskMix: DeliveryAnalysisSnapshot["riskMix"];
  className?: string;
};

export function BriefingDeliverySnapshot({ riskMix, className }: Props) {
  const total = ORDER.reduce((n, k) => n + riskMix[k], 0);
  const segments = ORDER.map((key) => ({
    key,
    count: riskMix[key],
    pct: total > 0 ? (riskMix[key] / total) * 100 : 0,
  })).filter((s) => s.count > 0);

  const riskCount = riskMix.blocked + riskMix.overdue;
  const riskPct = total > 0 ? Math.round((riskCount / total) * 100) : 0;

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-[24px] border border-border-subtle bg-pure-white p-5 shadow-[var(--shadow)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-[18px] leading-snug tracking-[-0.14px] text-ink">
            Open work mix
          </h3>
          <p className="mt-1 text-[13px] text-graphite">Jira backlog at last sync</p>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="font-display text-[28px] leading-none tracking-[-0.42px] tabular-nums text-ink">
              {total.toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] text-graphite">open</p>
          </div>
        )}
      </div>

      {total === 0 ? (
        <p className="mt-4 flex-1 text-[14px] text-ash">No open issues in scope.</p>
      ) : (
        <>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-metric-track">
            {segments.map((seg) => (
              <div
                key={seg.key}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${seg.pct}%`,
                  backgroundColor: RISK_MIX_COLORS[seg.key],
                  minWidth: seg.pct > 0 ? "4px" : undefined,
                }}
                title={`${RISK_MIX_LABELS[seg.key]}: ${seg.count}`}
              />
            ))}
          </div>

          <p className="mt-3 text-[14px] leading-relaxed text-ash">
            {riskCount > 0 ? (
              <>
                <span className="font-medium text-ink">{riskPct}%</span> need attention
                {riskMix.blocked > 0 && riskMix.overdue > 0
                  ? ` — ${riskMix.blocked} blocked, ${riskMix.overdue} overdue`
                  : riskMix.blocked > 0
                    ? ` — ${riskMix.blocked} blocked`
                    : ` — ${riskMix.overdue} overdue`}
              </>
            ) : (
              <>Mostly routine backlog — no blockers or overdue items</>
            )}
          </p>

          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {segments.map((seg) => (
              <li
                key={seg.key}
                className="flex items-center justify-between gap-2 text-[13px]"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-graphite">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: RISK_MIX_COLORS[seg.key] }}
                  />
                  <span className="truncate">{RISK_MIX_LABELS[seg.key]}</span>
                </span>
                <span className="shrink-0 tabular-nums text-ink">{seg.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Link
        href="/delivery-analysis"
        className="mt-4 inline-flex items-center gap-1 text-[15px] font-medium text-ink transition-colors hover:text-rust"
      >
        Open delivery analysis →
      </Link>
    </div>
  );
}
