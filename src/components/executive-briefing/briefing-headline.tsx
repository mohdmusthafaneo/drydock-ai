import { cn } from "@/lib/utils";
import type { HeadlineSegment } from "@/lib/executive-briefing/types";

type Props = {
  segments: HeadlineSegment[];
  className?: string;
};

export function BriefingHeadline({ segments, className }: Props) {
  return (
    <p
      className={cn(
        "max-w-3xl font-display text-[28px] leading-[1.2] tracking-[-0.4px] text-ink sm:text-[36px] sm:tracking-[-0.54px] lg:text-[44px] lg:leading-[1.1] lg:tracking-[-0.66px]",
        className,
      )}
    >
      {segments.map((segment, i) =>
        segment.kind === "emphasis" ? (
          <span key={i} className="italic text-chart-blue">
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
