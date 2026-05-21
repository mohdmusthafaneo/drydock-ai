import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { WorkflowConfigForm } from "@/components/governance/workflow-config-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <div>
        <Link href="/governance" className="text-sm text-[#93b4ff] hover:underline">
          ← Governance center
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Workflow configuration</h1>
        <p className="mt-1 text-slate-400">
          Set execution status and progressive autonomy for human-governed AI (Master FRD §7).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delivery workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowConfigForm
            currentMode={dna.autonomyMode}
            executionStatus={workflow?.executionStatus ?? "NOT_CONFIGURED"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
