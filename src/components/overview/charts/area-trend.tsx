import { cn } from "@/lib/utils";

export function AreaTrendChart({
  points,
  target,
  className,
}: {
  points: { label: string; value: number }[];
  target: number;
  className?: string;
}) {
  const width = 480;
  const height = 160;
  const padX = 12;
  const padTop = 12;
  const padBottom = 28;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const maxY = Math.max(100, target, ...points.map((p) => p.value));

  function xAt(i: number) {
    if (points.length <= 1) return padX + plotW / 2;
    return padX + (i / (points.length - 1)) * plotW;
  }

  function yAt(v: number) {
    return padTop + plotH - (v / maxY) * plotH;
  }

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`)
    .join(" ");

  const area =
    points.length > 0
      ? `${line} L ${xAt(points.length - 1).toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : "";

  const targetY = yAt(target);
  const gradId = "overview-trend-fill";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-40 w-full", className)}
      data-slot="area-trend"
      role="img"
      aria-label="Delivery confidence trend"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2F80ED" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#2F80ED" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <line
        x1={padX}
        y1={targetY}
        x2={width - padX}
        y2={targetY}
        stroke="var(--text-faint)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <text
        x={width - padX}
        y={targetY - 4}
        textAnchor="end"
        className="fill-[var(--text-faint)]"
        style={{ fontSize: 10 }}
      >
        Target {target}
      </text>

      {area ? <path d={area} fill={`url(#${gradId})`} /> : null}
      {line ? (
        <path d={line} fill="none" stroke="#2F80ED" strokeWidth={2} strokeLinejoin="round" />
      ) : null}

      {points.map((p, i) => (
        <circle
          key={p.label}
          cx={xAt(i)}
          cy={yAt(p.value)}
          r={3}
          fill="#2F80ED"
          stroke="#fff"
          strokeWidth={1.5}
        />
      ))}

      {points.map((p, i) => (
        <text
          key={`lbl-${p.label}`}
          x={xAt(i)}
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
