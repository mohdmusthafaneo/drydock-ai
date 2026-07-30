import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ActivatePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [dna, connected] = await Promise.all([
    prisma.deliveryDNA.findUnique({
      where: { organizationId: session.organizationId },
      select: { id: true },
    }),
    prisma.integration.findFirst({
      where: { organizationId: session.organizationId, status: "CONNECTED" },
      select: { id: true },
    }),
  ]);

  if (dna && connected) redirect("/dashboard");
  if (dna) redirect("/integrations?from=activate");

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title="Activate your workspace"
        description="AIDOS reads your delivery systems, then briefs leadership with recommendations you approve. Nothing deploys without a human decision."
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-[22px] tracking-[-0.2px] text-ink">
            Connect first for a real briefing
          </CardTitle>
          <CardDescription className="text-[15px] leading-relaxed text-ash">
            Start with Jira or GitHub (read-only). You can set Delivery DNA policy posture
            anytime — maturity questions are optional.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild variant="ink" size="lg">
            <Link href="/integrations?from=activate">Connect systems</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/governance/setup">Complete Delivery DNA</Link>
          </Button>
        </CardContent>
      </Card>

      <ul className="space-y-2 text-[14px] text-ash">
        <li>
          <span className="font-medium text-ink">Briefing</span> — executive verdict from live
          delivery signals
        </li>
        <li>
          <span className="font-medium text-ink">Recommendations</span> — governed, queue-aware
          next actions
        </li>
        <li>
          <span className="font-medium text-ink">Human approvals</span> — release and policy gates
          stay with you
        </li>
      </ul>
    </div>
  );
}
