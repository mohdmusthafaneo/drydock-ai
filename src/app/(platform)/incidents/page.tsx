import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function IncidentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Incidents"
        description="Operational incidents correlated with releases and observability telemetry."
      />

      <Card>
        <CardHeader>
          <CardTitle>All incidents ({ctx.incidents.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {ctx.incidents.length === 0 ? (
            <p className="text-sm text-muted">
              No incidents — deploy with degradation or assess high-risk releases to generate
              correlated incidents.
            </p>
          ) : (
            ctx.incidents.map((inc) => (
              <Link
                key={inc.id}
                href={`/incidents/${inc.id}`}
                className="block rounded-xl border border-border-subtle bg-pure-white p-4 shadow-[var(--shadow-subtle)] transition-colors hover:bg-fog"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium text-primary">{inc.title}</p>
                  <Badge variant={inc.status === "OPEN" ? "warning" : "muted"}>
                    {inc.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  Severity {inc.severityScore}
                  {inc.correlationId && ` · ${inc.correlationId}`}
                  {inc.release && ` · ${inc.release.name}`}
                </p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
