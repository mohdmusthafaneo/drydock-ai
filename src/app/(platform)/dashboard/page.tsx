import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { loadExecutiveBriefing } from "@/lib/executive-briefing/load-briefing-context";
import { composeExecutiveDeck } from "@/lib/executive-briefing/compose-executive-deck";
import { ExecutiveBriefingHero } from "@/components/executive-briefing/executive-briefing-hero";
import { BriefingBreakdownSection } from "@/components/executive-briefing/briefing-breakdown-section";
import { BriefingExecutiveDeck } from "@/components/executive-briefing/briefing-executive-deck";

export default async function EnterpriseDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { briefing, charts, ctx, orgName } = await loadExecutiveBriefing(session.organizationId);

  if (!ctx.dna) {
    return (
      <div className="mx-auto max-w-lg space-y-8 py-20 text-center">
        <h1 className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] text-ink">
          Governance cockpit
        </h1>
        <p className="text-[16px] leading-relaxed text-ash">
          Configure delivery governance and QA policies before running release intelligence.
        </p>
        <Button asChild variant="ink" size="lg">
          <Link href="/governance/setup">Configure governance</Link>
        </Button>
      </div>
    );
  }

  const deck = composeExecutiveDeck({
    briefing,
    ctx,
    hasDelivery: charts.delivery != null,
    hasEngineering: charts.engineering != null,
    hasObservability: charts.stability != null,
  });

  return (
    <div className="w-full">
      <ExecutiveBriefingHero briefing={briefing} orgName={orgName} />
      <BriefingBreakdownSection briefing={briefing} />
      <BriefingExecutiveDeck briefing={briefing} deck={deck} orgName={orgName} />
    </div>
  );
}
