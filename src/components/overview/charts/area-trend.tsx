import { cn } from "@/lib/utils";

const MARKER_STROKES = [
  "#51a87e",
  "#51a87e",
  "#51a87e",
  "#51a87e",
  "#f0a91e",
  "#f0a91e",
  "#ef6b53",
  "#ef6b53",
] as const;

const Y_LABELS = [100, 75, 50, 25, 0] as const;

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
  const height = 125;
  const padX = 4;
  const padTop = 6;
  const padBottom = 6;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const maxY = 100;

  function xAt(i: number) {
    if (points.length <= 1) return padX + plotW / 2;
    return padX + (i / (points.length - 1)) * plotW;
  }

  function yAt(v: number) {
    return padTop + plotH - (Math.min(maxY, Math.max(0, v)) / maxY) * plotH;
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

  const xLabelIndexes =
    points.length <= 4
      ? points.map((_, i) => i)
      : [0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1];

  return (
    <div className={cn("relative h-[158px] pr-1 pl-[30px]", className)} data-slot="area-trend">
      <div className="pointer-events-none absolute top-[3px] bottom-5 left-0 flex flex-col justify-between text-[10px] text-[#718096]">
        {Y_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      {points.length === 0 ? (
        <div className="flex h-[125px] items-center justify-center text-[12px] text-muted">
          No trend data yet
        </div>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="block h-[125px] w-full overflow-visible"
            role="img"
            aria-label="Delivery confidence trend"
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#cdeedc" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#cdeedc" stopOpacity="0" />
              </linearGradient>
            </defs>

            {Y_LABELS.map((label) => {
              const y = yAt(label);
              return (
                <line
                  key={`g-${label}`}
                  x1={padX}
                  y1={y}
                  x2={width - padX}
                  y2={y}
                  stroke="#e7ebef"
                  strokeWidth={1}
                />
              );
            })}

            <line
              x1={padX}
              y1={targetY}
              x2={width - padX}
              y2={targetY}
              stroke="#9aa6b5"
              strokeWidth={1.2}
              strokeDasharray="4 4"
            />

            {area ? <path d={area} fill={`url(#${gradId})`} /> : null}
            {line ? (
              <path
                d={line}
                fill="none"
                stroke="#5bb88a"
                strokeWidth={2.2}
                strokeLinejoin="round"
              />
            ) : null}

            {points.map((p, i) => (
              <circle
                key={p.label}
                cx={xAt(i)}
                cy={yAt(p.value)}
                r={4}
                fill="#fff"
                stroke={MARKER_STROKES[Math.min(i, MARKER_STROKES.length - 1)]}
                strokeWidth={2}
              />
            ))}
          </svg>

          <div className="flex justify-between pt-0.5 text-[9px] text-[#718096]">
            {xLabelIndexes.map((i) => (
              <span key={points[i]!.label}>{points[i]!.label}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
