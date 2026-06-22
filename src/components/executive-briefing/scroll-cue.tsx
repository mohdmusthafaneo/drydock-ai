"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { EDITORIAL_EASE } from "@/components/motion/motion-tokens";

type Props = {
  href?: string;
  className?: string;
};

export function ScrollCue({ href = "#breakdown", className }: Props) {
  const reduce = useReducedMotion();

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 text-[15px] font-medium text-ink transition-colors hover:text-ash",
        className,
      )}
    >
      More detail
      <motion.span
        aria-hidden
        animate={reduce ? undefined : { y: [0, 4, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
      </motion.span>
    </Link>
  );
}
