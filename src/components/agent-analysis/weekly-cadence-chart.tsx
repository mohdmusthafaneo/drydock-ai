import { cn } from "@/lib/utils";

type WeekPoint = {
  isoWeek: string;
  commits: number;
};

type Props = {
  title?: string;
  description?: string;
  weeks: WeekPoint[];
  className?: string;
};

/**
 * Small SVG bar chart for the last N ISO weeks of commit cadence.
 */
export function WeeklyCadenceChart({
  title = "Weekly cadence",
  description = "Commits by ISO week",
  weeks,
  className,
}: Props) {
  const points = weeks.slice(-12);
  const max = Math.max(...points.map((w) => w.commits), 1);

  if (points.length === 0) {
    return (
      <div
        className={cn(
          "rounded-[var(--radius-card)] border border-dashed border-border-subtle bg-elevated/40 px-5 py-6 text-sm text-muted",
          className,
        )}
      >
        No weekly volume yet.
      </div>
    );
  }

  const width = 360;
  const height = 120;
  const padX = 8;
  const padY = 12;
  const gap = 4;
  const barWidth = (width - padX * 2 - gap * (points.length - 1)) / points.length;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-pure-white px-5 py-5 shadow-[var(--shadow)]",
        className,
      )}
    >
      <p className="font-display text-[17px] text-ink">{title}</p>
      <p className="mt-1 text-[13px] text-graphite">{description}</p>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 h-auto w-full"
        role="img"
        aria-label={title}
      >
        {points.map((w, i) => {
          const h = ((w.commits / max) * (height - padY * 2)) || 2;
          const x = padX + i * (barWidth + gap);
          const y = height - padY - h;
          return (
            <g key={w.isoWeek}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={3}
                className="fill-ink/75"
              >
                <title>
                  {w.isoWeek}: {w.commits} commits
                </title>
              </rect>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex justify-between text-[11px] text-muted">
        <span>{points[0]?.isoWeek}</span>
        <span>{points[points.length - 1]?.isoWeek}</span>
      </div>
    </div>
  );
}
