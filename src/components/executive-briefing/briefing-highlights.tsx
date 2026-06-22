"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { BriefingHighlight } from "@/lib/executive-briefing/types";
import { HoverArrow } from "@/components/motion/hover-arrow";
import { MotionHoverRow } from "@/components/motion/motion-hover-row";
import { EDITORIAL_EASE, fadeUp } from "@/components/motion/motion-tokens";

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

function HighlightRow({
  item,
  index,
  total,
}: {
  item: BriefingHighlight;
  index: number;
  total: number;
}) {
  const rowClass = cn(
    "flex items-center justify-between gap-4 px-5 py-4 transition-colors",
    index === 0 && "rounded-t-[24px]",
    index === total - 1 && "rounded-b-[24px]",
    item.href && "hover:bg-fog/80",
  );

  const content = (
    <MotionHoverRow className={rowClass}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
          {item.label}
        </p>
        {item.subtext && (
          <p className="mt-1 line-clamp-2 break-words font-display text-[15px] leading-snug text-ash">
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
        {item.href && <HoverArrow />}
      </div>
    </MotionHoverRow>
  );

  if (item.href) {
    return (
      <Link href={item.href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

export function BriefingHighlights({ highlights, className }: Props) {
  const reduce = useReducedMotion();

  if (highlights.length === 0) return null;

  const panelClass = cn(
    "divide-y divide-border-subtle rounded-[24px] border border-border-subtle bg-pure-white shadow-[var(--shadow)]",
    className,
  );

  if (reduce) {
    return (
      <div className={panelClass}>
        {highlights.map((item, index) => (
          <HighlightRow key={item.id} item={item} index={index} total={highlights.length} />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      className={panelClass}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
      }}
    >
      {highlights.map((item, index) => (
        <motion.div
          key={item.id}
          variants={fadeUp}
          transition={{ duration: 0.45, ease: EDITORIAL_EASE }}
        >
          <HighlightRow item={item} index={index} total={highlights.length} />
        </motion.div>
      ))}
    </motion.div>
  );
}
