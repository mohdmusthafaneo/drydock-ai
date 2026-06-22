"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

type Props = HTMLMotionProps<"div"> & {
  children: ReactNode;
};

export function MotionHoverRow({ children, className, ...rest }: Props) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className={className} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      initial="rest"
      whileHover="hover"
      {...rest}
    >
      {children}
    </motion.div>
  );
}
