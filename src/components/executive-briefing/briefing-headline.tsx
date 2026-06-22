"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { HeadlineSegment } from "@/lib/executive-briefing/types";
import { EDITORIAL_EASE, fadeUp } from "@/components/motion/motion-tokens";

type Props = {
  segments: HeadlineSegment[];
  className?: string;
};

const headlineClass = cn(
  "max-w-3xl font-display text-[28px] leading-[1.2] tracking-[-0.4px] text-ink sm:text-[36px] sm:tracking-[-0.54px] lg:text-[44px] lg:leading-[1.1] lg:tracking-[-0.66px]",
);

export function BriefingHeadline({ segments, className }: Props) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <p className={cn(headlineClass, className)}>
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

  return (
    <motion.p
      className={cn(headlineClass, className)}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06, delayChildren: 0.16 } },
      }}
    >
      {segments.map((segment, i) => (
        <motion.span
          key={i}
          variants={fadeUp}
          transition={{ duration: 0.5, ease: EDITORIAL_EASE }}
          className={segment.kind === "emphasis" ? "italic text-chart-blue" : undefined}
        >
          {segment.text}
        </motion.span>
      ))}
    </motion.p>
  );
}
