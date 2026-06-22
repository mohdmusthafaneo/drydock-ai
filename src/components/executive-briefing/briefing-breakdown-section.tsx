"use client";

import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import { BriefingClaimCard } from "@/components/executive-briefing/briefing-claim-card";
import { BriefingFreshnessStrip } from "@/components/executive-briefing/briefing-freshness-strip";
import { RevealItem } from "@/components/motion/reveal-item";
import { RevealSection } from "@/components/motion/reveal-section";
import { cn } from "@/lib/utils";

type Props = {
  briefing: ExecutiveBriefing;
  id?: string;
};

function claimGridClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return "grid-cols-1 sm:grid-cols-2";
}

export function BriefingBreakdownSection({ briefing, id = "breakdown" }: Props) {
  const { claims } = briefing;
  const hasClaims = claims.length > 0;

  if (!hasClaims) {
    return null;
  }

  const staleHandledByClaim = claims.some(
    (claim) => claim.id === "governance" && claim.verdictLabel === "Data stale",
  );

  return (
    <RevealSection id={id} className="scroll-mt-24 space-y-8 py-16">
      <div className="space-y-4">
        <RevealItem transition={{ duration: 0.55 }}>
          <div>
            <h2 className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] text-ink">
              What needs attention
            </h2>
            <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ash">
              The things that matter most right now — each with a clear verdict you can act on or
              delegate.
            </p>
          </div>
        </RevealItem>
        {briefing.freshness.stale && !staleHandledByClaim && (
          <RevealItem>
            <BriefingFreshnessStrip freshness={briefing.freshness} variant="banner" />
          </RevealItem>
        )}
      </div>

      <div className={cn("grid gap-5", claimGridClass(claims.length))}>
        {claims.map((claim) => (
          <RevealItem key={claim.id}>
            <BriefingClaimCard claim={claim} />
          </RevealItem>
        ))}
      </div>
    </RevealSection>
  );
}
