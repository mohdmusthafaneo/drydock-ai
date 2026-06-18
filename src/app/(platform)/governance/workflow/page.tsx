import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { WorkflowConfigForm } from "@/components/governance/workflow-config-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";

export default async function WorkflowConfigurationPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [dna, workflow] = await Promise.all([
    prisma.deliveryDNA.findUnique({ where: { organizationId: session.organizationId } }),
    prisma.deliveryWorkflow.findUnique({ where: { organizationId: session.organizationId } }),
  ]);

  if (!dna) redirect("/governance/setup");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/governance"
        className="inline-block text-[15px] font-medium text-ink hover:text-rust"
      >
        ← Governance center
      </Link>
      <PageHeader
        title="Workflow configuration"
        description="Set execution status and progressive autonomy for human-governed AI (Master FRD §7)."
        className="pb-4"
      />

      <Card>
        <CardHeader>
          <CardTitle>Delivery workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowConfigForm
            currentMode={dna.autonomyMode}
            executionStatus={workflow?.executionStatus ?? "ACTIVE"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
