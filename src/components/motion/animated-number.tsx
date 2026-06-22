"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EDITORIAL_EASE, viewportOnce } from "@/components/motion/motion-tokens";

type Props = {
  value: number;
  className?: string;
  delay?: number;
  duration?: number;
  suffix?: string;
  /** Animate on mount instead of when scrolled into view */
  onMount?: boolean;
};

export function AnimatedNumber({
  value,
  className,
  delay = 0,
  duration = 0.8,
  suffix = "",
  onMount = false,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, viewportOnce);
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const shouldAnimate = onMount || inView;

  useEffect(() => {
    if (!shouldAnimate) return;
    if (reduce) {
      setDisplay(value);
      return;
    }
    setDisplay(0);
    const controls = animate(0, value, {
      duration,
      delay,
      ease: EDITORIAL_EASE,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [shouldAnimate, value, reduce, delay, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  );
}
