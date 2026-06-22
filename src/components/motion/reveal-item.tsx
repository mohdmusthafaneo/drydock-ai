"use client";

import { motion, type HTMLMotionProps, type Transition } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp, revealTransition } from "@/components/motion/motion-tokens";

type Props = HTMLMotionProps<"div"> & {
  children: ReactNode;
  transition?: Transition;
};

export function RevealItem({ children, className, transition, ...rest }: Props) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      transition={{ ...revealTransition, ...transition }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
