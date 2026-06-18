import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AuditLogsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Audit logs"
        description="Compliance officer view — validate policies, inspect AI approvals, export reports."
      >
        <Button asChild variant="ink" size="lg">
          <a href="/api/audit/export">Export CSV</a>
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Recent events ({ctx.auditLogs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {ctx.auditLogs.length === 0 ? (
            <p className="text-sm text-muted">No audit events yet.</p>
          ) : (
            <ul className="space-y-2">
              {ctx.auditLogs.map((log) => (
                <li
                  key={log.id}
                  className="rounded-xl bg-elevated px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-ink">{log.action}</span>
                    <span className="text-xs text-muted">
                      {log.createdAt.toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-secondary">
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ""}
                    {log.user ? ` · ${log.user.name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
