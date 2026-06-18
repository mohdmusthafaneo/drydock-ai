import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";

export default async function GovernancePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);

  if (!ctx.dna) {
    redirect("/governance/setup");
  }

  const escalation = JSON.parse(ctx.dna.escalationMatrix || "{}") as Record<string, string>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Delivery governance"
        description="Policies, approval depth, risk thresholds, and human-governed execution controls."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/governance/workflow"
            className="text-[15px] font-medium text-ink hover:text-rust"
          >
            Workflow config
          </Link>
          <Link
            href="/governance/setup"
            className="text-[15px] font-medium text-ink hover:text-rust"
          >
            Re-run setup
          </Link>
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Governance score</CardDescription>
            <CardTitle className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] text-ink">
              {ctx.dna.governanceScore}/100
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Autonomy mode</CardDescription>
            <CardTitle>
              <Badge variant="ai">{ctx.dna.autonomyMode}</Badge>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Policy profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted">Workflow: </span>
            {ctx.dna.workflowMode}
          </p>
          <p>
            <span className="text-muted">Approval level: </span>
            {ctx.dna.approvalLevel}
          </p>
          <p>
            <span className="text-muted">Risk threshold: </span>
            {(ctx.dna.riskThreshold * 100).toFixed(0)}%
          </p>
          <p>
            <span className="text-muted">Compliance: </span>
            {ctx.profile?.complianceType || "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Escalation matrix</CardTitle>
          <CardDescription>Human approval paths by severity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(escalation).map(([level, action]) => (
            <div
              key={level}
              className="flex justify-between rounded-[16px] bg-fog px-4 py-2 text-sm"
            >
              <span className="capitalize text-muted">{level}</span>
              <span className="text-ink">{action}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {ctx.dna.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery DNA summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-ash">{ctx.dna.summary}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Human-governed workflow</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-ash">
          AI observes, correlates, and recommends. Humans approve and supervise deployment.
          All release decisions are audit-logged.
        </CardContent>
      </Card>
    </div>
  );
}
