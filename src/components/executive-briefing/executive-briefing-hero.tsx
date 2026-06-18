import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import { BriefingHeadline } from "@/components/executive-briefing/briefing-headline";
import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import { BriefingInsightBox } from "@/components/executive-briefing/briefing-insight";
import { ScrollCue } from "@/components/executive-briefing/scroll-cue";
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
      <div className="mb-8 space-y-2">
        <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-graphite">
          Executive briefing
        </p>
        <h1 className="font-display text-[22px] leading-[1.25] tracking-[-0.2px] text-ash">
          {orgName}
        </h1>
      </div>

      <div
        className={cn(
          "grid gap-8 lg:gap-12",
          hasHighlights && "lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:items-start",
        )}
      >
        <div className="space-y-6">
          <BriefingHeadline segments={briefing.headline} />
          <p className="text-[14px] leading-relaxed text-graphite">{briefing.meta}</p>
          {briefing.insight && <BriefingInsightBox insight={briefing.insight} />}
        </div>

        {hasHighlights && <BriefingHighlights highlights={briefing.highlights} />}
      </div>

      <div className="mt-10 flex justify-center sm:justify-end">
        <ScrollCue />
      </div>
    </section>
  );
}
