import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { parseHirePayload } from "@/lib/agent-control-plane/hire";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { AgentHireApprovalCard } from "@/components/approvals/agent-hire-approval-card";

function approvalTitle(approval: {
  type: string;
  title: string | null;
  recommendation: { title: string } | null;
}): string {
  if (approval.type === "AGENT_HIRE") {
    return approval.title ?? "Agent hire request";
  }
  return approval.recommendation?.title ?? approval.title ?? "Approval";
}

export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const pending = ctx.approvals.filter((a) => !a.decision);
  const decided = ctx.approvals.filter((a) => a.decision);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Approval center"
        description="Human-governed gate for recommendations and agent hires. No deployment or agent activation without approval."
      />

      <Card>
        <CardHeader>
          <CardTitle>Pending approvals</CardTitle>
          <CardDescription>{pending.length} awaiting decision</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 ? (
            <p className="text-sm text-muted">All caught up.</p>
          ) : (
            pending.map((approval) => {
              if (approval.type === "AGENT_HIRE") {
                const payload = parseHirePayload(approval.payloadJson);
                if (!payload) {
                  return (
                    <p key={approval.id} className="text-sm text-error">
                      Invalid agent hire payload
                    </p>
                  );
                }
                return (
                  <AgentHireApprovalCard
                    key={approval.id}
                    approvalId={approval.id}
                    title={approvalTitle(approval)}
                    payload={payload}
                  />
                );
              }

              if (!approval.recommendation) return null;

              return (
                <div key={approval.id} className="space-y-1">
                  {approval.recommendation.releaseId && (
                    <p className="text-xs text-muted">Release-linked recommendation</p>
                  )}
                  <ApprovalActions
                    approvalId={approval.id}
                    title={approvalTitle(approval)}
                  />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decision history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {decided.length === 0 ? (
            <p className="text-sm text-muted">No decisions yet.</p>
          ) : (
            decided.map((approval) => (
              <div
                key={approval.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-elevated px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {approval.type === "AGENT_HIRE" && (
                    <Badge variant="ai">Agent hire</Badge>
                  )}
                  <span className="text-primary">{approvalTitle(approval)}</span>
                </div>
                <Badge variant={approval.decision === "APPROVED" ? "success" : "muted"}>
                  {approval.decision}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
