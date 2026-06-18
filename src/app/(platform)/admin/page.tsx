import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function AdminPanelPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role !== "ORG_ADMIN" && session.role !== "DELIVERY_MANAGER") {
    redirect("/dashboard");
  }

  const [org, members, dna, workflow] = await Promise.all([
    prisma.organization.findUnique({ where: { id: session.organizationId } }),
    prisma.user.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.deliveryDNA.findUnique({ where: { organizationId: session.organizationId } }),
    prisma.deliveryWorkflow.findUnique({ where: { organizationId: session.organizationId } }),
  ]);

  if (!dna) redirect("/governance/setup");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Admin panel"
        description="Organization administration — users, governance, and delivery health (Org Admin journey)."
      />

      <Card>
        <CardHeader>
          <CardTitle>{org?.name}</CardTitle>
          <CardDescription>Slug: {org?.slug}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-secondary">
            Governance level:{" "}
            <Badge variant="ai">{dna.governanceScore}/100</Badge>
          </p>
          <p className="text-secondary">
            Workflow: {workflow?.workflowType ?? "—"} · {workflow?.executionStatus ?? "NOT_CONFIGURED"}
          </p>
          <Link
            href="/governance/workflow"
            className="inline-block text-ink underline-offset-4 hover:underline"
          >
            Configure workflow →
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
          <CardDescription>Invite users — full invite flow Phase 2</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex justify-between rounded-xl bg-elevated px-4 py-2 text-sm"
            >
              <span className="text-primary">
                {m.name} · {m.email}
              </span>
              <span className="text-muted">{ROLE_LABELS[m.role]}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <Link href="/integrations" className="text-ink underline-offset-4 hover:underline">
            Integrations
          </Link>
          <Link href="/governance/setup" className="text-ink underline-offset-4 hover:underline">
            Re-run discovery
          </Link>
          <Link href="/audit" className="text-ink underline-offset-4 hover:underline">
            Audit logs
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
