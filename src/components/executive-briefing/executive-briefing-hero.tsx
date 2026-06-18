import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import { DeliveryHealthGauge } from "@/components/executive-briefing/delivery-health-gauge";
import { BriefingNarrative } from "@/components/executive-briefing/briefing-narrative";
import { BriefingPrimaryCta } from "@/components/executive-briefing/briefing-primary-cta";
import { ScrollCue } from "@/components/executive-briefing/scroll-cue";
import { BriefingFreshnessStrip } from "@/components/executive-briefing/briefing-freshness-strip";
import { cn } from "@/lib/utils";

type Props = {
  briefing: ExecutiveBriefing;
  orgName: string;
};

export function ExecutiveBriefingHero({ briefing, orgName }: Props) {
  const healthLabel =
    briefing.health.visible && briefing.health.bandLabel
      ? `Delivery confidence: ${briefing.health.bandLabel}`
      : null;

  return (
    <section
      className={cn(
        "steep-hero-glow -mx-4 flex min-h-[calc(100vh-4rem)] flex-col justify-center rounded-[24px] px-4 pb-8 lg:-mx-6 lg:min-h-[calc(100vh-5rem)] lg:px-6 lg:pb-12",
      )}
    >
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.04em] text-graphite">
            Executive briefing
          </p>
          <h1 className="font-display mt-2 text-[44px] leading-[1.1] tracking-[-0.66px] text-ink">
            {orgName}
          </h1>
        </div>
        <BriefingFreshnessStrip freshness={briefing.freshness} />
      </div>

      <div className="grid items-center gap-10 lg:grid-cols-[minmax(160px,220px)_1fr] lg:gap-16">
        <DeliveryHealthGauge
          score={briefing.health.overall}
          band={briefing.health.band}
          bandLabel={briefing.health.bandLabel}
          visible={briefing.health.visible}
          className="mx-auto lg:mx-0"
        />
        <BriefingNarrative narrative={briefing.narrative} healthLabel={healthLabel} />
      </div>

      <div className="mt-12 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          {briefing.primaryCta && (
            <BriefingPrimaryCta
              label={briefing.primaryCta.label}
              href={briefing.primaryCta.href}
            />
          )}
        </div>
        <ScrollCue />
      </div>
    </section>
  );
}
