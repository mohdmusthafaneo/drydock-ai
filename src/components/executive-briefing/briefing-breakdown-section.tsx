import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import { BriefingClaimCard } from "@/components/executive-briefing/briefing-claim-card";

type Props = {
  briefing: ExecutiveBriefing;
  id?: string;
};

export function BriefingBreakdownSection({ briefing, id = "breakdown" }: Props) {
  if (briefing.claims.length === 0) {
    return null;
  }

  return (
    <section id={id} className="scroll-mt-20 space-y-6 border-t border-border py-12">
      <div>
        <h2 className="text-lg font-semibold tracking-tight lg:text-xl">What this means</h2>
        <p className="mt-1 text-sm text-secondary">
          Evidence behind your briefing — tap through for the full picture.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {briefing.claims.map((claim) => (
          <BriefingClaimCard key={claim.id} claim={claim} />
        ))}
      </div>
    </section>
  );
}
