"use client";

import { useReducedMotion } from "motion/react";

export function useMotionSafe() {
  const reduce = useReducedMotion();
  return {
    reduce: !!reduce,
    motionInitial: reduce ? false : ("hidden" as const),
    motionDisabled: reduce,
  };
}
