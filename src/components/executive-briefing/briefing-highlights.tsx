import Link from "next/link";
import { ArrowRight } from "lucide-react";
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

function HighlightRow({ item, index, total }: { item: BriefingHighlight; index: number; total: number }) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
          {item.label}
        </p>
        {item.subtext && (
          <p className="mt-1 break-words font-display text-[15px] leading-snug text-ash line-clamp-2">
            {item.subtext}
          </p>
        )}
      </div>
      <div className="flex w-[5.5rem] shrink-0 items-center justify-end gap-1.5">
        <p
          className={cn(
            "w-full text-right font-display text-[32px] leading-none tracking-[-0.48px] tabular-nums",
            TONE_VALUE[item.tone ?? "neutral"],
          )}
        >
          {item.value}
        </p>
        {item.href && (
          <ArrowRight
            className="h-4 w-4 shrink-0 text-graphite opacity-0 transition-opacity group-hover:opacity-100"
            strokeWidth={1.5}
            aria-hidden
          />
        )}
      </div>
    </>
  );

  const rowClass = cn(
    "group flex items-center justify-between gap-4 px-5 py-4 transition-colors",
    index === 0 && "rounded-t-[24px]",
    index === total - 1 && "rounded-b-[24px]",
    item.href && "hover:bg-fog/80",
  );

  if (item.href) {
    return (
      <Link href={item.href} className={rowClass}>
        {content}
      </Link>
    );
  }

  return <div className={rowClass}>{content}</div>;
}

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
        <HighlightRow key={item.id} item={item} index={index} total={highlights.length} />
      ))}
    </div>
  );
}
