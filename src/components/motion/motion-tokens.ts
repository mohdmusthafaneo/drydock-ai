export const EDITORIAL_EASE = [0.22, 1, 0.36, 1] as const;

export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
} as const;

export const fadeInFromRight = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0 },
} as const;

export const revealTransition = {
  duration: 0.45,
  ease: EDITORIAL_EASE,
} as const;

export const mountContainerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0 },
  },
} as const;

export const scrollContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
} as const;

export const viewportOnce = { once: true, margin: "-80px" as const };
