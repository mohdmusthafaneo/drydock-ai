import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadExecutiveBriefing } from "@/lib/executive-briefing/load-briefing-context";
import { composeExecutiveDeck } from "@/lib/executive-briefing/compose-executive-deck";
import { loadProblemPredictions } from "@/lib/problem-prediction/load-predictions";
import {
  BriefingBreakdownSection,
  BriefingExecutiveDeck,
  ExecutiveBriefingHero,
  GovernanceEmptyState,
} from "@/components/executive-briefing/dashboard-sections";
import { EarlyWarningsCard } from "@/components/executive-briefing/early-warnings-card";

export default async function EnterpriseDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [{ briefing, charts, ctx, orgName }, predictions] = await Promise.all([
    loadExecutiveBriefing(session.organizationId),
    loadProblemPredictions(session.organizationId, {
      status: "open",
      limit: 20,
    }).catch(() => []),
  ]);

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
      <EarlyWarningsCard
        predictions={predictions}
        lastEvaluatedAt={briefing.freshness.asOf}
      />
      <BriefingExecutiveDeck briefing={briefing} deck={deck} orgName={orgName} />
    </div>
  );
}
