import { cn } from "@/lib/utils";

const Y_LABELS = [120, 80, 40, 0] as const;

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
  const height = 125;
  const padX = 4;
  const padTop = 6;
  const padBottom = 6;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const maxY = Math.max(
    120,
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
  const xLabelIndexes =
    labels.length <= 4
      ? labels.map((_, i) => i)
      : [0, Math.floor((labels.length - 1) / 3), Math.floor(((labels.length - 1) * 2) / 3), labels.length - 1];

  const empty = ideal.length === 0 && actual.length === 0;

  return (
    <div className={cn("relative h-[158px] pr-1 pl-[30px]", className)} data-slot="burndown">
      <div className="pointer-events-none absolute top-[3px] bottom-5 left-0 flex flex-col justify-between text-[10px] text-[#718096]">
        {Y_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      {empty ? (
        <div className="flex h-[125px] items-center justify-center text-[12px] text-muted">
          No burndown data yet
        </div>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="block h-[125px] w-full overflow-visible"
            role="img"
            aria-label="Sprint burndown"
          >
            {Y_LABELS.map((label) => {
              const y = yAt((label / 120) * maxY);
              return (
                <line
                  key={`hg-${label}`}
                  x1={padX}
                  y1={y}
                  x2={width - padX}
                  y2={y}
                  stroke="#e7ebef"
                  strokeWidth={1}
                />
              );
            })}

            {labels.map((_, i) => (
              <line
                key={`vg-${i}`}
                x1={xAt(i, labels.length)}
                y1={padTop}
                x2={xAt(i, labels.length)}
                y2={padTop + plotH}
                stroke="#e7ebef"
                strokeWidth={1}
              />
            ))}

            <path
              d={pathFor(ideal)}
              fill="none"
              stroke="#9ca6b3"
              strokeWidth={1.4}
              strokeDasharray="4 4"
            />
            <path
              d={pathFor(actual)}
              fill="none"
              stroke="#347ff0"
              strokeWidth={2.3}
              strokeLinejoin="round"
            />
            {actual.map((p, i) => (
              <circle
                key={p.label}
                cx={xAt(i, actual.length)}
                cy={yAt(p.value)}
                r={4}
                fill="#fff"
                stroke="#347ff0"
                strokeWidth={2}
              />
            ))}
          </svg>

          <div className="flex justify-between pt-0.5 text-[9px] text-[#718096]">
            {xLabelIndexes.map((i) => (
              <span key={labels[i]!.label}>{labels[i]!.label}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
