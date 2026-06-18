import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { loadExecutiveBriefing } from "@/lib/executive-briefing/load-briefing-context";
import { ExecutiveBriefingHero } from "@/components/executive-briefing/executive-briefing-hero";
import { BriefingBreakdownSection } from "@/components/executive-briefing/briefing-breakdown-section";
import { FullOperationalDeck } from "@/components/executive-briefing/full-operational-deck";

export default async function EnterpriseDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { workspaceMode: true, name: true },
  });

  if (org?.workspaceMode === "MVP") {
    redirect("/accelerator");
  }

  const { briefing, charts, ctx, orgName } = await loadExecutiveBriefing(session.organizationId);

  if (!ctx.dna) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Governance cockpit</h1>
        <p className="text-secondary">
          Configure delivery governance and QA policies before running release intelligence.
        </p>
        <Button asChild>
          <Link href="/governance/setup">Configure governance</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full pb-24 lg:pb-8">
      <ExecutiveBriefingHero briefing={briefing} orgName={orgName} />
      <BriefingBreakdownSection briefing={briefing} charts={charts} />
      <FullOperationalDeck ctx={ctx} orgName={orgName} />
    </div>
  );
}
