import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import {
  buildOpenIncidentsClaim,
  incidentSeverityLabel,
  incidentStatusLabel,
  sortIncidentsByUrgency,
} from "@/lib/governance/presentation";
import { PageHeader } from "@/components/layout/page-header";
import { BriefingClaimCard } from "@/components/executive-briefing/briefing-claim-card";
import { RevealSection } from "@/components/motion/reveal-section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_BADGE = {
  OPEN: "warning",
  INVESTIGATING: "ai",
  REMEDIATED: "muted",
  CLOSED: "muted",
} as const;

export default async function IncidentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const claim = buildOpenIncidentsClaim(ctx);
  const sorted = sortIncidentsByUrgency(ctx.incidents);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Incidents"
        description="Production incidents correlated with releases — sorted by severity and status."
      />

      <RevealSection>
        <BriefingClaimCard claim={claim} />
      </RevealSection>

      <Card>
        <CardHeader>
          <CardTitle>All incidents</CardTitle>
          <CardDescription>
            {ctx.incidents.length} total · open items surfaced first
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted">
              No incidents — deploy with degradation or assess high-risk releases to generate
              correlated incidents.
            </p>
          ) : (
            sorted.map((inc) => {
              const isOpen = inc.status === "OPEN" || inc.status === "INVESTIGATING";
              const severity = incidentSeverityLabel(inc.severityScore);

              return (
                <Link
                  key={inc.id}
                  href={`/incidents/${inc.id}`}
                  className={cn(
                    "block rounded-xl border border-border-subtle bg-pure-white p-4 shadow-[var(--shadow-subtle)] transition-colors hover:bg-fog",
                    isOpen && inc.severityScore >= 70 && "border-rust/20 bg-rust/5",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-primary">{inc.title}</p>
                      <p className="mt-1 text-sm text-muted">
                        {severity} severity
                        {inc.release && ` · ${inc.release.name}`}
                        {inc.correlationId && ` · ${inc.correlationId}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isOpen && (
                        <span className="inline-flex items-center rounded-full border border-apricot/40 bg-apricot-wash/60 px-2.5 py-1 text-[11px] font-medium text-rust">
                          {severity}
                        </span>
                      )}
                      <Badge
                        variant={
                          STATUS_BADGE[inc.status as keyof typeof STATUS_BADGE] ?? "muted"
                        }
                      >
                        {incidentStatusLabel(inc.status)}
                      </Badge>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
