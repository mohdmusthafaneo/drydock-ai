"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { HeadlineSegment } from "@/lib/executive-briefing/types";
import { spacingBetweenSegments } from "@/lib/executive-briefing/headline-format";
import { EDITORIAL_EASE, fadeUp } from "@/components/motion/motion-tokens";

type Props = {
  segments: HeadlineSegment[];
  className?: string;
};

const headlineClass = cn(
  "max-w-3xl text-[18px] font-semibold leading-[1.35] tracking-[-0.2px] text-ink sm:text-[20px]",
);

function renderHeadlineSegments(segments: HeadlineSegment[]) {
  return segments.map((segment, index) => {
    const prev = index > 0 ? segments[index - 1] : null;
    const prefix = prev ? spacingBetweenSegments(prev, segment) : "";

    if (segment.kind === "emphasis") {
      return (
        <span key={index} className="italic text-brown">
          {prefix}
          {segment.text}
        </span>
      );
    }

    return (
      <span key={index}>
        {prefix}
        {segment.text}
      </span>
    );
  });
}

function renderAnimatedHeadlineSegments(segments: HeadlineSegment[]) {
  return segments.map((segment, index) => {
    const prev = index > 0 ? segments[index - 1] : null;
    const prefix = prev ? spacingBetweenSegments(prev, segment) : "";

    return (
      <motion.span
        key={index}
        variants={fadeUp}
        transition={{ duration: 0.5, ease: EDITORIAL_EASE }}
        className={segment.kind === "emphasis" ? "italic text-brown" : undefined}
      >
        {prefix}
        {segment.text}
      </motion.span>
    );
  });
}

export function BriefingHeadline({ segments, className }: Props) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <p className={cn(headlineClass, className)}>
        {renderHeadlineSegments(segments)}
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
      {renderAnimatedHeadlineSegments(segments)}
    </motion.p>
  );
}
