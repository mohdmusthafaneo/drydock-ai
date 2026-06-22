"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { EDITORIAL_EASE } from "@/components/motion/motion-tokens";

export function GovernanceEmptyState() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="mx-auto max-w-lg space-y-8 py-20 text-center"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EDITORIAL_EASE }}
    >
      <h1 className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] text-ink">
        Governance cockpit
      </h1>
      <p className="text-[16px] leading-relaxed text-ash">
        Configure delivery governance and QA policies before running release intelligence.
      </p>
      <Button asChild variant="ink" size="lg">
        <Link href="/governance/setup">Configure governance</Link>
      </Button>
    </motion.div>
  );
}
