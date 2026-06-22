"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { EDITORIAL_EASE, viewportOnce } from "@/components/motion/motion-tokens";

type Props = {
  score: number;
  className?: string;
};

export function AnimatedScoreBar({ score, className }: Props) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={cn("h-full rounded-full", className)}
      initial={reduce ? false : { width: 0, opacity: 0 }}
      whileInView={{ width: `${score}%`, opacity: 1 }}
      viewport={viewportOnce}
      transition={{ duration: 0.7, delay: 0.15, ease: EDITORIAL_EASE }}
    />
  );
}
