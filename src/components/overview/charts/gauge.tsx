import type { ConfidenceBand } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

const BAND_PILL: Record<ConfidenceBand, string> = {
  Strong: "bg-success-soft text-success",
  Steady: "bg-info-soft text-info",
  Caution: "bg-[#fff0e8] text-[#ef5d1c]",
  "At risk": "bg-error-soft text-error",
};

/** 180° SVG gauge — coral / amber / mint segments with centre score. */
export function ConfidenceGauge({
  score,
  band,
  className,
}: {
  score: number;
  band: ConfidenceBand;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const width = 220;
  const height = 130;
  const cx = width / 2;
  const cy = 112;
  const r = 88;
  const stroke = 14;

  function polar(angleDeg: number, radius = r) {
    // 180° arc from left (180) to right (0)
    const rad = (Math.PI * angleDeg) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy - radius * Math.sin(rad),
    };
  }

  function arcPath(startAngle: number, endAngle: number) {
    const start = polar(startAngle);
    const end = polar(endAngle);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
  }

  // Marker angle: 180 at 0, 0 at 100
  const markerAngle = 180 - (clamped / 100) * 180;
  const marker = polar(markerAngle, r);
  // Darker shade of the segment the marker sits on (coral / amber / mint thirds).
  const markerFill =
    clamped < 100 / 3
      ? "var(--gauge-marker-coral)"
      : clamped < (100 * 2) / 3
        ? "var(--gauge-marker-amber)"
        : "var(--gauge-marker-mint)";

  const ticks = [0, 25, 50, 75, 100];
  // White radial gaps between coral / amber / mint (matches overview mockup).
  const segmentGap = 1;
  const segments = [
    { start: 180, end: 120 + segmentGap, stroke: "var(--gauge-coral)" },
    { start: 120 - segmentGap, end: 60 + segmentGap, stroke: "var(--gauge-amber)" },
    { start: 60 - segmentGap, end: 0, stroke: "var(--gauge-mint)" },
  ] as const;

  return (
    <div className={cn("relative mx-auto w-full max-w-[240px]", className)} data-slot="gauge">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" aria-hidden>
        {segments.map((segment) => (
          <path
            key={segment.stroke}
            d={arcPath(segment.start, segment.end)}
            fill="none"
            stroke={segment.stroke}
            strokeWidth={stroke}
            strokeLinecap="butt"
          />
        ))}

        {ticks.map((t) => {
          const a = 180 - (t / 100) * 180;
          const inner = polar(a, r - 18);
          const outer = polar(a, r - 10);
          return (
            <g key={t}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="var(--text-faint)"
                strokeWidth={1}
              />
              <text
                x={polar(a, r - 28).x}
                y={polar(a, r - 28).y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-[var(--text-faint)]"
                style={{ fontSize: 9 }}
              >
                {t}
              </text>
            </g>
          );
        })}

        <circle
          cx={marker.x}
          cy={marker.y}
          r={7}
          fill={markerFill}
          stroke="#ffffff"
          strokeWidth={2.5}
        />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 top-[48%] flex flex-col items-center">
        <p className="text-[45px] font-semibold leading-none tracking-[-2px] text-ink">
          {Math.round(clamped)}
        </p>
        <span
          className={cn(
            "mt-1 rounded-[14px] px-[15px] py-[7px] text-[14px] font-semibold",
            BAND_PILL[band],
          )}
        >
          {band}
        </span>
      </div>
    </div>
  );
}
