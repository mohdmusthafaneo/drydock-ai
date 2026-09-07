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
  /** Strip outer card chrome when nesting inside a composite panel. */
  bare?: boolean;
};

const TONE_VALUE: Record<NonNullable<BriefingHighlight["tone"]>, string> = {
  neutral: "text-ink",
  good: "text-success",
  attention: "text-brown",
  risk: "text-coral",
};

function HighlightRow({
  item,
  index,
  total,
  bare,
}: {
  item: BriefingHighlight;
  index: number;
  total: number;
  bare?: boolean;
}) {
  const rowClass = cn(
    "flex items-center justify-between gap-4 px-5 py-3 transition-colors",
    !bare && index === 0 && "rounded-t-[var(--radius-card)]",
    !bare && index === total - 1 && "rounded-b-[var(--radius-card)]",
    item.href && "hover:bg-hover",
  );

  const content = (
    <MotionHoverRow className={rowClass}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          {item.label}
        </p>
        {item.subtext && (
          <p className="mt-1 line-clamp-2 break-words text-[13px] leading-snug text-secondary">
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

export function BriefingHighlights({ highlights, className, bare }: Props) {
  const reduce = useReducedMotion();

  if (highlights.length === 0) return null;

  const panelClass = cn(
    bare
      ? "divide-y divide-border"
      : "divide-y divide-border rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]",
    className,
  );

  if (reduce) {
    return (
      <div className={panelClass}>
        {highlights.map((item, index) => (
          <HighlightRow
            key={item.id}
            item={item}
            index={index}
            total={highlights.length}
            bare={bare}
          />
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
          <HighlightRow
            item={item}
            index={index}
            total={highlights.length}
            bare={bare}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
