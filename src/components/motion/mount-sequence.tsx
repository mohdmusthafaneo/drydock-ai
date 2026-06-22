"use client";

import { motion, type HTMLMotionProps, type Variants } from "motion/react";
import type { ReactNode } from "react";
import {
  fadeInFromRight,
  fadeUp,
  mountContainerVariants,
  revealTransition,
} from "@/components/motion/motion-tokens";
import { useMotionSafe } from "@/components/motion/use-motion-safe";

type ContainerProps = HTMLMotionProps<"div"> & {
  children: ReactNode;
};

export function MountSequence({ children, className, ...rest }: ContainerProps) {
  const { motionInitial } = useMotionSafe();

  return (
    <motion.div
      className={className}
      initial={motionInitial}
      animate="visible"
      variants={mountContainerVariants}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

type ItemProps = HTMLMotionProps<"div"> & {
  children: ReactNode;
  variant?: "up" | "right";
  transition?: { duration?: number; delay?: number };
};

const variantMap: Record<"up" | "right", Variants> = {
  up: fadeUp,
  right: fadeInFromRight,
};

export function MountItem({
  children,
  className,
  variant = "up",
  transition,
  ...rest
}: ItemProps) {
  return (
    <motion.div
      className={className}
      variants={variantMap[variant]}
      transition={{ ...revealTransition, ...transition }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
