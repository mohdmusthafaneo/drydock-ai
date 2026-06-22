"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  iconClassName?: string;
  visible?: "hover" | "always";
};

export function HoverArrow({ className, iconClassName, visible = "hover" }: Props) {
  const reduce = useReducedMotion();

  if (reduce || visible === "always") {
    return (
      <span className={cn("inline-flex shrink-0", className)}>
        <ArrowRight
          className={cn("h-3.5 w-3.5", iconClassName)}
          strokeWidth={1.5}
          aria-hidden
        />
      </span>
    );
  }

  return (
    <motion.span
      className={cn("inline-flex shrink-0", className)}
      variants={{
        rest: { opacity: visible === "hover" ? 0 : 1, x: 0 },
        hover: { opacity: 1, x: 2 },
      }}
    >
      <ArrowRight
        className={cn("h-3.5 w-3.5", iconClassName)}
        strokeWidth={1.5}
        aria-hidden
      />
    </motion.span>
  );
}
