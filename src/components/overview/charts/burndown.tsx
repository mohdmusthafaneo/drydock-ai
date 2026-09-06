import { cn } from "@/lib/utils";

export function BurndownChart({
  ideal,
  actual,
  className,
}: {
  ideal: { label: string; value: number }[];
  actual: { label: string; value: number }[];
  className?: string;
}) {
  const width = 480;
  const height = 160;
  const padX = 12;
  const padTop = 12;
  const padBottom = 28;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const maxY = Math.max(
    1,
    ...ideal.map((p) => p.value),
    ...actual.map((p) => p.value),
  );
  function xAt(i: number, len: number) {
    if (len <= 1) return padX + plotW / 2;
    return padX + (i / (len - 1)) * plotW;
  }

  function yAt(v: number) {
    return padTop + plotH - (v / maxY) * plotH;
  }

  function pathFor(points: { value: number }[]) {
    return points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"} ${xAt(i, points.length).toFixed(1)} ${yAt(p.value).toFixed(1)}`,
      )
      .join(" ");
  }

  const labels = ideal.length >= actual.length ? ideal : actual;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-40 w-full", className)}
      data-slot="burndown"
      role="img"
      aria-label="Sprint burndown"
    >
      <path
        d={pathFor(ideal)}
        fill="none"
        stroke="var(--text-faint)"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      <path
        d={pathFor(actual)}
        fill="none"
        stroke="#2F80ED"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {actual.map((p, i) => (
        <circle
          key={p.label}
          cx={xAt(i, actual.length)}
          cy={yAt(p.value)}
          r={3.5}
          fill="#2F80ED"
          stroke="#fff"
          strokeWidth={1.5}
        />
      ))}
      {labels.map((p, i) => (
        <text
          key={p.label}
          x={xAt(i, labels.length)}
          y={height - 8}
          textAnchor="middle"
          className="fill-[var(--text-faint)]"
          style={{ fontSize: 10 }}
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}
