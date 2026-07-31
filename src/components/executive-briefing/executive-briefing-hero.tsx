"use client";

import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import type { AgentRunFreshness } from "@/lib/agent-analysis/types";
import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import { BriefingInsightBox } from "@/components/executive-briefing/briefing-insight";
import { BriefingNarrative } from "@/components/executive-briefing/briefing-narrative";
import { ScrollCue } from "@/components/executive-briefing/scroll-cue";
import { AgentFreshnessStrip } from "@/components/agent-analysis/agent-freshness-strip";
import { MountItem, MountSequence } from "@/components/motion/mount-sequence";
import { cn } from "@/lib/utils";

type Props = {
  briefing: ExecutiveBriefing;
  orgName: string;
  agentFreshness?: AgentRunFreshness[];
};

function formatLlmGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ExecutiveBriefingHero({
  briefing,
  orgName,
  agentFreshness,
}: Props) {
  const hasHighlights = briefing.highlights.length > 0;
  const isLlmEnriched = briefing.source === "llm_enriched";

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
              {isLlmEnriched && (
                <span className="ml-2 normal-case tracking-normal text-ash">
                  · AI summary
                  {briefing.llmGeneratedAt && (
                    <span className="text-graphite">
                      {" "}
                      · generated {formatLlmGeneratedAt(briefing.llmGeneratedAt)}
                    </span>
                  )}
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
            <MountItem transition={{ delay: 0.16 }}>
              <BriefingNarrative
                narrative={briefing.narrative}
                healthLabel={briefing.health.bandLabel}
              />
            </MountItem>
            <MountItem transition={{ delay: 0.24 }}>
              <p className="text-[14px] leading-relaxed text-graphite">{briefing.meta}</p>
            </MountItem>
            {agentFreshness && agentFreshness.length > 0 && (
              <MountItem transition={{ delay: 0.28 }}>
                <AgentFreshnessStrip freshness={agentFreshness} className="pt-1" />
              </MountItem>
            )}
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
