"use client";

import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import { BriefingHeadline } from "@/components/executive-briefing/briefing-headline";
import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import { BriefingInsightBox } from "@/components/executive-briefing/briefing-insight";
import { ScrollCue } from "@/components/executive-briefing/scroll-cue";
import { MountItem, MountSequence } from "@/components/motion/mount-sequence";
import { cn } from "@/lib/utils";

type Props = {
  briefing: ExecutiveBriefing;
  orgName: string;
};

export function ExecutiveBriefingHero({ briefing, orgName }: Props) {
  const hasHighlights = briefing.highlights.length > 0;

  return (
    <section
      className={cn(
        "steep-hero-glow -mx-4 rounded-[24px] px-4 pt-4 pb-10 lg:-mx-6 lg:px-6 lg:pt-6 lg:pb-14",
      )}
    >
      <MountSequence>
        <div className="mb-8 space-y-2">
          <MountItem>
            <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-graphite">
              Executive briefing
              {briefing.source === "llm_enriched" && (
                <span className="ml-2 normal-case tracking-normal text-ash">
                  · AI summary
                </span>
              )}
            </p>
          </MountItem>
          <MountItem transition={{ delay: 0.08 }}>
            <h1 className="font-display text-[22px] leading-[1.25] tracking-[-0.2px] text-ash">
              {orgName}
            </h1>
          </MountItem>
        </div>

        <div
          className={cn(
            "grid gap-8 lg:gap-12",
            hasHighlights && "lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:items-start",
          )}
        >
          <div className="space-y-6">
            <BriefingHeadline segments={briefing.headline} />
            <MountItem transition={{ delay: 0.24 }}>
              <p className="text-[14px] leading-relaxed text-graphite">{briefing.meta}</p>
            </MountItem>
            {briefing.insight && (
              <MountItem transition={{ delay: 0.32 }}>
                <BriefingInsightBox insight={briefing.insight} />
              </MountItem>
            )}
          </div>

          {hasHighlights && (
            <MountItem variant="right" transition={{ duration: 0.55, delay: 0.4 }}>
              <BriefingHighlights highlights={briefing.highlights} />
            </MountItem>
          )}
        </div>

        <div className="mt-10 flex justify-center sm:justify-end">
          <MountItem transition={{ duration: 0.4, delay: 0.55 }}>
            <ScrollCue />
          </MountItem>
        </div>
      </MountSequence>
    </section>
  );
}
