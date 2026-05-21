import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function IncidentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Incidents</h1>
        <p className="mt-1 text-slate-400">
          Operational incidents correlated with releases and observability telemetry.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All incidents ({ctx.incidents.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {ctx.incidents.length === 0 ? (
            <p className="text-sm text-slate-500">
              No incidents — deploy with degradation or assess high-risk releases to generate
              correlated incidents.
            </p>
          ) : (
            ctx.incidents.map((inc) => (
              <Link
                key={inc.id}
                href={`/incidents/${inc.id}`}
                className="block rounded-lg border border-white/8 bg-[#1B2435] p-4 hover:border-[#4F8CFF]/40"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">{inc.title}</p>
                  <Badge variant={inc.status === "OPEN" ? "warning" : "muted"}>
                    {inc.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">
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
