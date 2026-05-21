import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/roles";
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin panel</h1>
        <p className="mt-1 text-slate-400">
          Organization administration — users, governance, and delivery health (Org Admin journey).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{org?.name}</CardTitle>
          <CardDescription>Slug: {org?.slug}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Governance level:{" "}
            <Badge variant="ai">{dna.governanceScore}/100</Badge>
          </p>
          <p>
            Workflow: {workflow?.workflowType ?? "—"} · {workflow?.executionStatus ?? "NOT_CONFIGURED"}
          </p>
          <Link href="/governance/workflow" className="text-[#93b4ff] hover:underline">
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
              className="flex justify-between rounded-lg bg-[#131A2A]/50 px-4 py-2 text-sm"
            >
              <span>
                {m.name} · {m.email}
              </span>
              <span className="text-slate-500">{ROLE_LABELS[m.role]}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Link href="/integrations" className="text-[#93b4ff] hover:underline">
            Integrations
          </Link>
          <Link href="/governance/setup" className="text-[#93b4ff] hover:underline">
            Re-run discovery
          </Link>
          <Link href="/audit" className="text-[#93b4ff] hover:underline">
            Audit logs
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
