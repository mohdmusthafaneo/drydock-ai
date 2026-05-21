import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AuditLogsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Audit logs</h1>
          <p className="mt-1 text-slate-400">
            Compliance officer view — validate policies, inspect AI approvals, export reports.
          </p>
        </div>
        <Button asChild variant="secondary">
          <a href="/api/audit/export">Export CSV</a>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent events ({ctx.auditLogs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {ctx.auditLogs.length === 0 ? (
            <p className="text-sm text-slate-500">No audit events yet.</p>
          ) : (
            <ul className="space-y-2">
              {ctx.auditLogs.map((log) => (
                <li
                  key={log.id}
                  className="rounded-lg bg-[#131A2A]/60 px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-[#93b4ff]">{log.action}</span>
                    <span className="text-xs text-slate-500">
                      {log.createdAt.toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-400">
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
