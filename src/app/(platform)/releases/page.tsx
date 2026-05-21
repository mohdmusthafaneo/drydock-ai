import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Release governance</h1>
          <p className="mt-1 text-slate-400">
            Track release events through assessment, approval, and controlled deployment.
          </p>
        </div>
        <Button asChild>
          <Link href="/releases/new">+ Register release</Link>
        </Button>
      </div>

      {releases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#4F8CFF]/30 bg-[#4F8CFF]/5 px-6 py-12 text-center">
          <p className="text-slate-400">No releases yet. Register a release event to start the workflow.</p>
          <Button asChild className="mt-4">
            <Link href="/releases/new">Register release</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {releases.map((r) => (
            <Link
              key={r.id}
              href={`/releases/${r.id}`}
              className="block rounded-xl border border-white/8 bg-[#1B2435] p-5 transition-colors hover:border-[#4F8CFF]/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-medium">
                    {r.name}
                    {r.version ? ` · ${r.version}` : ""}
                  </p>
                  <p className="text-sm text-slate-500">{r.environment}</p>
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
                <p className="mt-2 text-sm text-slate-400">
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
