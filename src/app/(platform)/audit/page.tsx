import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AuditLogsPanel } from "@/components/audit/audit-logs-panel";

export default async function AuditLogsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const logs = ctx.auditLogs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    createdAt: log.createdAt.toISOString(),
    userName: log.user?.name ?? null,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Audit logs"
        description="Compliance officer view — filter by decision type, inspect approvals, export reports."
      >
        <Button asChild variant="ink" size="lg">
          <a href="/api/audit/export">Export CSV</a>
        </Button>
      </PageHeader>

      <AuditLogsPanel logs={logs} />
    </div>
  );
}
