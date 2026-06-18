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
    <section id={id} className="scroll-mt-20 space-y-6 border-t border-border py-12">
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight lg:text-xl">What this means</h2>
          <p className="mt-1 text-sm text-secondary">
            Evidence behind your briefing — tap through for the full picture.
          </p>
        </div>
        {briefing.freshness.stale && (
          <BriefingFreshnessStrip freshness={briefing.freshness} variant="banner" />
        )}
      </div>

      {hasClaims && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {briefing.claims.map((claim) => (
            <BriefingClaimCard key={claim.id} claim={claim} />
          ))}
        </div>
      )}

      {hasCharts && <BriefingMiniCharts charts={charts} />}
    </section>
  );
}
