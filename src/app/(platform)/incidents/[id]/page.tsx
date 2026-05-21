import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IncidentRemediationForm } from "@/components/incidents/incident-remediation-form";

const DEVOPS_ROLES = new Set(["ORG_ADMIN", "DEVOPS_LEAD", "ENGINEERING_MANAGER", "DELIVERY_MANAGER"]);

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const incident = await prisma.incident.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { release: true },
  });

  if (!incident) notFound();

  const services = JSON.parse(incident.affectedServicesJson || "[]") as string[];
  const canRemediate = DEVOPS_ROLES.has(session.role);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/incidents" className="text-sm text-[#93b4ff] hover:underline">
          ← Incidents
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{incident.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="warning">{incident.status}</Badge>
          <Badge variant="muted">Severity {incident.severityScore}</Badge>
          {incident.source && <Badge variant="ai">{incident.source}</Badge>}
        </div>
      </div>

      {incident.description && (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">{incident.description}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Correlation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {incident.correlationId && (
            <p>
              <span className="text-slate-500">Correlation ID: </span>
              {incident.correlationId}
            </p>
          )}
          {incident.release && (
            <p>
              <span className="text-slate-500">Release: </span>
              <Link
                href={`/releases/${incident.release.id}`}
                className="text-[#93b4ff] hover:underline"
              >
                {incident.release.name}
              </Link>
            </p>
          )}
          {services.length > 0 && (
            <p>
              <span className="text-slate-500">Affected: </span>
              {services.join(", ")}
            </p>
          )}
          <p className="text-slate-500">Detected {incident.detectedAt.toLocaleString()}</p>
        </CardContent>
      </Card>

      {canRemediate ? (
        <Card>
          <CardHeader>
            <CardTitle>Remediation</CardTitle>
          </CardHeader>
          <CardContent>
            <IncidentRemediationForm
              incidentId={incident.id}
              currentStatus={incident.status}
            />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-slate-500">
          DevOps Lead or Admin role required to update remediation status.
        </p>
      )}

      {incident.remediationNotes && (
        <Card>
          <CardHeader>
            <CardTitle>Remediation notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{incident.remediationNotes}</CardContent>
        </Card>
      )}
    </div>
  );
}
