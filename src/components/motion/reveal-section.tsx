"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { scrollContainerVariants, viewportOnce } from "@/components/motion/motion-tokens";
import { useMotionSafe } from "@/components/motion/use-motion-safe";

type Props = HTMLMotionProps<"section"> & {
  children: ReactNode;
};

export function RevealSection({ children, className, ...rest }: Props) {
  const { motionInitial } = useMotionSafe();

  return (
    <motion.section
      className={className}
      initial={motionInitial}
      whileInView="visible"
      viewport={viewportOnce}
      variants={scrollContainerVariants}
      {...rest}
    >
      {children}
    </motion.section>
  );
}
