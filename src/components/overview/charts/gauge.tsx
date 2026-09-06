import type { ConfidenceBand } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

const BAND_PILL: Record<ConfidenceBand, string> = {
  Strong: "bg-success-soft text-success",
  Steady: "bg-info-soft text-info",
  Caution: "bg-accent-soft text-accent",
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

  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className={cn("relative mx-auto w-full max-w-[240px]", className)} data-slot="gauge">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" aria-hidden>
        <path
          d={arcPath(180, 120)}
          fill="none"
          stroke="var(--gauge-coral)"
          strokeWidth={stroke}
          strokeLinecap="butt"
        />
        <path
          d={arcPath(120, 60)}
          fill="none"
          stroke="var(--gauge-amber)"
          strokeWidth={stroke}
          strokeLinecap="butt"
        />
        <path
          d={arcPath(60, 0)}
          fill="none"
          stroke="var(--gauge-mint)"
          strokeWidth={stroke}
          strokeLinecap="butt"
        />

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
          fill="var(--gauge-marker)"
          stroke="#ffffff"
          strokeWidth={2.5}
        />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 top-[52%] flex flex-col items-center">
        <p className="text-[36px] font-semibold leading-none tracking-tight text-ink">
          {Math.round(clamped)}
        </p>
        <span
          className={cn(
            "mt-2 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            BAND_PILL[band],
          )}
        >
          {band}
        </span>
      </div>
    </div>
  );
}
