import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getSession } from "@/lib/session";
import { loadExecutiveBriefing } from "@/lib/executive-briefing/load-briefing-context";
import { composeExecutiveDeck } from "@/lib/executive-briefing/compose-executive-deck";
import { PageHeader } from "@/components/layout/page-header";
import { BriefingHeadline } from "@/components/executive-briefing/briefing-headline";
import { BriefingClaimCard } from "@/components/executive-briefing/briefing-claim-card";
import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import { DeliveryHealthGauge } from "@/components/executive-briefing/delivery-health-gauge";
import { RevealSection } from "@/components/motion/reveal-section";
import { Button } from "@/components/ui/button";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { briefing, charts, ctx, orgName } = await loadExecutiveBriefing(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const deck = composeExecutiveDeck({
    briefing,
    ctx,
    hasDelivery: charts.delivery != null,
    hasEngineering: charts.engineering != null,
    hasObservability: charts.stability != null,
  });

  const topClaims = briefing.claims.slice(0, 3);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Executive summary"
        description="A printable leadership briefing — what matters now, not a metric wall."
      >
        <Button asChild variant="link" size="sm" className="h-auto px-0">
          <a href="/api/audit/export">Export audit CSV</a>
        </Button>
      </PageHeader>

      <section className="rounded-[24px] border border-border-subtle bg-pure-white px-6 py-8 shadow-[var(--shadow)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
          {orgName} · {briefing.meta}
        </p>
        <div className="mt-4">
          <BriefingHeadline segments={briefing.headline} />
        </div>
        {briefing.insight && (
          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-ash">
            {briefing.insight.message}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <BriefingHighlights highlights={briefing.highlights} />
        <DeliveryHealthGauge
          score={briefing.health.overall}
          band={briefing.health.band}
          bandLabel={briefing.health.bandLabel}
          visible={briefing.health.visible}
        />
      </div>

      {topClaims.length > 0 && (
        <RevealSection className="space-y-4">
          <div>
            <h2 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
              What needs your attention
            </h2>
            <p className="mt-1 text-[14px] text-graphite">
              Three claims max — delegate operational depth to your leads.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {topClaims.map((claim) => (
              <BriefingClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        </RevealSection>
      )}

      {deck.decisions.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
            Leadership decisions
          </h2>
          <div className="space-y-3">
            {deck.decisions.map((decision) => (
              <Link
                key={decision.id}
                href={decision.href}
                className="flex items-center justify-between gap-4 rounded-[24px] border border-border-subtle bg-pure-white px-5 py-4 shadow-[var(--shadow-subtle)] transition-colors hover:bg-fog/60"
              >
                <div>
                  <p className="font-display text-[17px] leading-snug text-ink">{decision.title}</p>
                  <p className="mt-1 text-[14px] text-ash">{decision.context}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-[14px] font-medium text-ink">
                  {decision.actionLabel}
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {deck.teamLinks.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
            Delegate the detail
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {deck.teamLinks.map((link) => (
              <Link
                key={link.id}
                href={link.href}
                className="rounded-[24px] border border-border-subtle bg-pure-white p-5 shadow-[var(--shadow-subtle)] transition-colors hover:bg-fog/60"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
                  {link.audience}
                </p>
                <p className="mt-2 font-display text-[17px] leading-snug text-ink">{link.title}</p>
                <p className="mt-1 text-[14px] text-ash">{link.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {deck.blindSpots.length > 0 && (
        <div className="rounded-[24px] border border-apricot/30 bg-apricot-wash/30 px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
            Data gaps
          </p>
          <ul className="mt-2 space-y-1 text-[14px] text-ash">
            {deck.blindSpots.map((spot) => (
              <li key={spot}>· {spot}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
