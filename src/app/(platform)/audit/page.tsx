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

  const logs = ctx.auditLogs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    createdAt: log.createdAt.toISOString(),
    userName: log.user?.name ?? null,
    actorType: log.actorType ?? null,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Decision log"
        description="Every decision, release sign-off, and connector action on the record. Nothing is hidden without a reason."
      >
        <Button asChild variant="ink" size="lg">
          <a href="/api/audit/export">Export CSV</a>
        </Button>
      </PageHeader>

      <AuditLogsPanel logs={logs} />
    </div>
  );
}
