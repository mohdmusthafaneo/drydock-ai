import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { governanceScoreBand } from "@/lib/governance/presentation";
import { PageHeader } from "@/components/layout/page-header";
import { GovernanceEmptyState } from "@/components/executive-briefing/governance-empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const VERDICT_BADGE = {
  strong: "border-dove/50 bg-fog text-ash",
  steady: "border-dove/50 bg-fog text-ash",
  caution: "border-apricot/40 bg-apricot-wash/60 text-rust",
  at_risk: "border-rust/25 bg-rust/8 text-rust",
} as const;

export default async function AdminPanelPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role !== "ORG_ADMIN" && session.role !== "DELIVERY_MANAGER") {
    redirect("/dashboard");
  }

  const [org, dna, workflow] = await Promise.all([
    prisma.organization.findUnique({ where: { id: session.organizationId } }),
    prisma.deliveryDNA.findUnique({ where: { organizationId: session.organizationId } }),
    prisma.deliveryWorkflow.findUnique({ where: { organizationId: session.organizationId } }),
  ]);

  if (!dna) {
    return (
      <div className="mx-auto max-w-3xl">
        <GovernanceEmptyState />
      </div>
    );
  }

  const { band, bandLabel } = governanceScoreBand(dna.governanceScore);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Admin console"
        description="Governance operations — workflow configuration, integrations, and audit access."
      />

      <section className="rounded-[24px] border border-border-subtle bg-pure-white px-6 py-6 shadow-[var(--shadow)]">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
            VERDICT_BADGE[band],
          )}
        >
          {bandLabel}
        </span>
        <h2 className="mt-3 font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
          Governance score {dna.governanceScore}/100
        </h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ash">
          {org?.name} is configured for recommend-only autonomy. Workflow:{" "}
          {workflow?.workflowType ?? "not configured"} ·{" "}
          {workflow?.executionStatus ?? "NOT_CONFIGURED"}.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Slug: {org?.slug}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-secondary">
            Autonomy: <Badge variant="ai">{dna.autonomyMode}</Badge>
          </p>
          <Link
            href="/governance/workflow"
            className="inline-block text-ink underline-offset-4 hover:underline"
          >
            Configure workflow →
          </Link>
          <p className="text-muted">
            Team invites and member management are in{" "}
            <Link href="/settings" className="text-ink underline-offset-4 hover:underline">
              Settings
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operations</CardTitle>
          <CardDescription>Governance and integration shortcuts.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <Link href="/integrations" className="text-ink underline-offset-4 hover:underline">
            Integrations
          </Link>
          <Link href="/governance/setup" className="text-ink underline-offset-4 hover:underline">
            Re-run Discovery & Delivery DNA
          </Link>
          <Link href="/audit" className="text-ink underline-offset-4 hover:underline">
            Audit logs
          </Link>
          <Link href="/governance" className="text-ink underline-offset-4 hover:underline">
            Delivery DNA briefing
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
