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
        "flex min-h-[calc(100vh-4rem)] flex-col justify-center pb-8 lg:min-h-[calc(100vh-5rem)] lg:pb-12",
      )}
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-medium text-secondary">{orgName}</h1>
        <BriefingFreshnessStrip freshness={briefing.freshness} />
      </div>

      <div className="grid items-center gap-10 lg:grid-cols-[minmax(140px,200px)_1fr] lg:gap-14">
        <DeliveryHealthGauge
          score={briefing.health.overall}
          band={briefing.health.band}
          bandLabel={briefing.health.bandLabel}
          visible={briefing.health.visible}
          className="mx-auto lg:mx-0"
        />
        <BriefingNarrative narrative={briefing.narrative} healthLabel={healthLabel} />
      </div>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {briefing.primaryCta && (
            <BriefingPrimaryCta
              label={briefing.primaryCta.label}
              href={briefing.primaryCta.href}
              urgent={
                briefing.primaryCta.href.includes("incidents") ||
                briefing.primaryCta.href.includes("devops")
              }
            />
          )}
        </div>
        <ScrollCue />
      </div>
    </section>
  );
}
