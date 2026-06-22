import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadExecutiveBriefing } from "@/lib/executive-briefing/load-briefing-context";
import { composeExecutiveDeck } from "@/lib/executive-briefing/compose-executive-deck";
import {
  BriefingBreakdownSection,
  BriefingExecutiveDeck,
  ExecutiveBriefingHero,
  GovernanceEmptyState,
} from "@/components/executive-briefing/dashboard-sections";

export default async function EnterpriseDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { briefing, charts, ctx, orgName } = await loadExecutiveBriefing(session.organizationId);

  if (!ctx.dna) {
    return <GovernanceEmptyState />;
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
