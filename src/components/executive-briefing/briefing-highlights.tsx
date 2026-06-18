import { cn } from "@/lib/utils";
import type { BriefingHighlight } from "@/lib/executive-briefing/types";

type Props = {
  highlights: BriefingHighlight[];
  className?: string;
};

const TONE_VALUE: Record<NonNullable<BriefingHighlight["tone"]>, string> = {
  neutral: "text-ink",
  good: "text-ink",
  attention: "text-rust",
  risk: "text-rust",
};

export function BriefingHighlights({ highlights, className }: Props) {
  if (highlights.length === 0) return null;

  return (
    <div
      className={cn(
        "divide-y divide-border-subtle rounded-[24px] border border-border-subtle bg-pure-white shadow-[var(--shadow)]",
        className,
      )}
    >
      {highlights.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            "flex items-center justify-between gap-6 px-5 py-4",
            index === 0 && "rounded-t-[24px]",
            index === highlights.length - 1 && "rounded-b-[24px]",
          )}
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
              {item.label}
            </p>
            {item.subtext && (
              <p className="mt-1 truncate font-display text-[15px] leading-snug text-ash">
                {item.subtext}
              </p>
            )}
          </div>
          <p
            className={cn(
              "shrink-0 font-display text-[36px] leading-none tracking-[-0.54px] tabular-nums sm:text-[44px] sm:tracking-[-0.66px]",
              TONE_VALUE[item.tone ?? "neutral"],
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
