import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Delivery governance</h1>
          <p className="mt-1 text-slate-400">
            Policies, approval depth, risk thresholds, and human-governed execution controls.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/governance/workflow">Workflow config</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/governance/setup">Re-run setup</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Governance score</CardDescription>
            <CardTitle className="text-3xl">{ctx.dna.governanceScore}/100</CardTitle>
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
            <span className="text-slate-500">Workflow: </span>
            {ctx.dna.workflowMode}
          </p>
          <p>
            <span className="text-slate-500">Approval level: </span>
            {ctx.dna.approvalLevel}
          </p>
          <p>
            <span className="text-slate-500">Risk threshold: </span>
            {(ctx.dna.riskThreshold * 100).toFixed(0)}%
          </p>
          <p>
            <span className="text-slate-500">Compliance: </span>
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
              className="flex justify-between rounded-lg bg-[#131A2A]/60 px-4 py-2 text-sm"
            >
              <span className="capitalize text-slate-400">{level}</span>
              <span>{action}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {ctx.dna.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery DNA summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">{ctx.dna.summary}</CardContent>
        </Card>
      )}

      <Card className="border-[#4F8CFF]/20">
        <CardHeader>
          <CardTitle>Human-governed workflow</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-400">
          AI observes, correlates, and recommends. Humans approve and supervise deployment.
          All release decisions are audit-logged.
        </CardContent>
      </Card>
    </div>
  );
}
