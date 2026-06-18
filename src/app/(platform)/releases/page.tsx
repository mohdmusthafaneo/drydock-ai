import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";

export default async function ReleasesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const dna = await prisma.deliveryDNA.findUnique({
    where: { organizationId: session.organizationId },
  });
  if (!dna) redirect("/governance/setup");

  const releases = await prisma.release.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Release governance"
        description="Track release events through assessment, approval, and controlled deployment."
      >
        <Button asChild variant="ink" size="lg">
          <Link href="/releases/new">+ Register release</Link>
        </Button>
      </PageHeader>

      {releases.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-dove bg-sky-wash/40 px-6 py-12 text-center">
          <p className="text-ash">No releases yet. Register a release event to start the workflow.</p>
          <Button asChild variant="ink" size="lg" className="mt-4">
            <Link href="/releases/new">Register release</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {releases.map((r) => (
            <Link
              key={r.id}
              href={`/releases/${r.id}`}
              className="block rounded-[var(--radius-card)] border border-border-subtle bg-surface p-5 shadow-[var(--shadow-subtle)] transition-colors hover:bg-hover"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-medium text-ink">
                    {r.name}
                    {r.version ? ` · ${r.version}` : ""}
                  </p>
                  <p className="text-sm text-muted">{r.environment}</p>
                </div>
                <Badge
                  variant={
                    r.status === "DEPLOYED"
                      ? "success"
                      : r.status === "BLOCKED"
                        ? "warning"
                        : r.status === "PENDING_APPROVAL"
                          ? "ai"
                          : "muted"
                  }
                >
                  {r.status.replace(/_/g, " ")}
                </Badge>
              </div>
              {r.readinessScore != null && (
                <p className="mt-2 text-sm text-ash">
                  QA readiness {Math.round(r.readinessScore)}% · governance risk{" "}
                  {r.governanceRiskScore != null ? Math.round(r.governanceRiskScore) : "—"}%
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
