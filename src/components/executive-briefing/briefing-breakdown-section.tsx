import type { BriefingCharts, ExecutiveBriefing } from "@/lib/executive-briefing/types";
import { BriefingClaimCard } from "@/components/executive-briefing/briefing-claim-card";
import { BriefingMiniCharts } from "@/components/executive-briefing/briefing-mini-charts";
import { BriefingFreshnessStrip } from "@/components/executive-briefing/briefing-freshness-strip";

type Props = {
  briefing: ExecutiveBriefing;
  charts: BriefingCharts;
  id?: string;
};

export function BriefingBreakdownSection({ briefing, charts, id = "breakdown" }: Props) {
  const hasClaims = briefing.claims.length > 0;
  const hasCharts =
    charts.delivery != null ||
    charts.engineering != null ||
    charts.stability != null ||
    charts.release != null;

  if (!hasClaims && !hasCharts) {
    return null;
  }

  return (
    <section id={id} className="scroll-mt-24 space-y-8 py-16">
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] text-ink">
            What this means
          </h2>
          <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ash">
            Evidence behind your briefing — tap through for the full picture.
          </p>
        </div>
        {briefing.freshness.stale && (
          <BriefingFreshnessStrip freshness={briefing.freshness} variant="banner" />
        )}
      </div>

      {hasClaims && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {briefing.claims.map((claim) => (
            <BriefingClaimCard key={claim.id} claim={claim} />
          ))}
        </div>
      )}

      {hasCharts && <BriefingMiniCharts charts={charts} />}
    </section>
  );
}
