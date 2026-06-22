"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { EDITORIAL_EASE, viewportOnce } from "@/components/motion/motion-tokens";

type Props = {
  fillPct: number;
  fillClassName: string;
  score: number;
  bandLabel: string | null;
  bandTextClassName: string;
};

export function AnimatedGaugeDisplay({
  fillPct,
  fillClassName,
  score,
  bandLabel,
  bandTextClassName,
}: Props) {
  const reduce = useReducedMotion();

  return (
    <>
      <div className="relative flex h-52 w-[72px] items-end justify-center rounded-full border border-dove/60 bg-pure-white p-2">
        <motion.div
          className={cn("w-full rounded-full", fillClassName)}
          initial={reduce ? false : { height: 0, opacity: 0 }}
          whileInView={{ height: `${fillPct}%`, opacity: 1 }}
          viewport={viewportOnce}
          transition={{ duration: 0.9, delay: 0.2, ease: EDITORIAL_EASE }}
        />
      </div>
      <motion.div
        className="text-center"
        initial={reduce ? false : { opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={viewportOnce}
        transition={{ duration: 0.4, delay: 0.5, ease: EDITORIAL_EASE }}
      >
        <AnimatedNumber
          value={score}
          delay={0.5}
          duration={0.8}
          className="text-[44px] leading-none tracking-[-0.66px] text-ink"
        />
        <p className={cn("mt-1 text-[15px] font-medium", bandTextClassName)}>{bandLabel}</p>
      </motion.div>
    </>
  );
}
