import type { ShareSegment } from "@/lib/agent-analysis/types";
import { cn } from "@/lib/utils";

const TONE_FILL: Record<NonNullable<ShareSegment["tone"]>, string> = {
  neutral: "bg-graphite/40",
  good: "bg-success/70",
  attention: "bg-apricot",
  risk: "bg-rust",
};

const FALLBACK_FILLS = [
  "bg-ink/80",
  "bg-graphite/50",
  "bg-ash/40",
  "bg-dove",
  "bg-ink/50",
  "bg-graphite/30",
];

type Props = {
  title: string;
  description?: string;
  segments: ShareSegment[];
  className?: string;
  /** Flag any single segment at or above this share (default 50). */
  concentrationThreshold?: number;
};

/**
 * Hand-rolled horizontal segmented share bar for severity mix and contributor share.
 */
export function SegmentedShareBar({
  title,
  description,
  segments,
  className,
  concentrationThreshold = 50,
}: Props) {
  const total = segments.reduce((n, s) => n + s.count, 0);
  const concentrated = segments.find((s) => s.sharePct >= concentrationThreshold);

  if (segments.length === 0 || total === 0) {
    return (
      <div
        className={cn(
          "rounded-[var(--radius-card)] border border-dashed border-border-subtle bg-elevated/40 px-5 py-6 text-sm text-muted",
          className,
        )}
      >
        No distribution data yet.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-pure-white px-5 py-5 shadow-[var(--shadow)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-[17px] text-ink">{title}</p>
          {description ? (
            <p className="mt-1 text-[13px] text-graphite">{description}</p>
          ) : null}
        </div>
        {concentrated ? (
          <span className="rounded-[8px] border border-accent-ring bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-brown">
            {concentrated.label} ≥ {concentrationThreshold}%
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-fog">
        {segments.map((seg, i) => (
          <div
            key={seg.id}
            className={cn(
              "h-full min-w-[2px] transition-all",
              seg.tone ? TONE_FILL[seg.tone] : FALLBACK_FILLS[i % FALLBACK_FILLS.length],
            )}
            style={{ width: `${Math.max(seg.sharePct, 0)}%` }}
            title={`${seg.label}: ${seg.sharePct}%`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {segments.map((seg, i) => (
          <li key={seg.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-secondary">
              <span
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  seg.tone ? TONE_FILL[seg.tone] : FALLBACK_FILLS[i % FALLBACK_FILLS.length],
                )}
              />
              <span className="truncate">{seg.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-primary">
              {seg.sharePct}%
              <span className="ml-1.5 text-xs text-muted">({seg.count})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
