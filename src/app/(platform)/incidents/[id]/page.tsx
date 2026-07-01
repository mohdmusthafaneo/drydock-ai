import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IncidentRemediationForm } from "@/components/incidents/incident-remediation-form";
import { IncidentRelatedChanges } from "@/components/incidents/incident-related-changes";
import { loadIncidentCodeLinks } from "@/lib/incident-code-correlation";

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

  const relatedChanges = await loadIncidentCodeLinks({
    organizationId: session.organizationId,
    incidentId: incident.id,
  });

  const services = JSON.parse(incident.affectedServicesJson || "[]") as string[];
  const canRemediate = DEVOPS_ROLES.has(session.role);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link
          href="/incidents"
          className="text-sm text-ink underline-offset-4 hover:underline"
        >
          ← Incidents
        </Link>
        <h1 className="mt-2 font-display text-[44px] leading-[1.1] tracking-[-0.66px] text-ink">
          {incident.title}
        </h1>
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
          <CardContent className="text-sm text-secondary">{incident.description}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Correlation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {incident.correlationId && (
            <p>
              <span className="text-muted">Correlation ID: </span>
              <span className="text-primary">{incident.correlationId}</span>
            </p>
          )}
          {incident.release && (
            <p>
              <span className="text-muted">Release: </span>
              <Link
                href={`/releases/${incident.release.id}`}
                className="text-ink underline-offset-4 hover:underline"
              >
                {incident.release.name}
              </Link>
            </p>
          )}
          {services.length > 0 && (
            <p>
              <span className="text-muted">Affected: </span>
              <span className="text-primary">{services.join(", ")}</span>
            </p>
          )}
          <p className="text-muted">Detected {incident.detectedAt.toLocaleString()}</p>
        </CardContent>
      </Card>

      <IncidentRelatedChanges links={relatedChanges} />

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
        <p className="text-sm text-muted">
          DevOps Lead or Admin role required to update remediation status.
        </p>
      )}

      {incident.remediationNotes && (
        <Card>
          <CardHeader>
            <CardTitle>Remediation notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-secondary">{incident.remediationNotes}</CardContent>
        </Card>
      )}
    </div>
  );
}
