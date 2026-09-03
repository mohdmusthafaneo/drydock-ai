import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";

export default async function ReleasesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const releases = await prisma.release.findMany({
    where: { organizationId: session.organizationId },
    include: { certificate: true, incidents: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Releases"
        description="The decision unit. Open a release to inspect trust counts and sign a Certificate."
      >
        <Link
          href="/releases/new"
          className="rounded-full bg-ink px-4 py-2 text-[14px] text-pure-white"
        >
          Register release
        </Link>
      </PageHeader>

      {releases.length === 0 ? (
        <p className="text-[15px] text-ash">
          No releases registered. The Ledger still holds the current trust count.
        </p>
      ) : (
        <ul className="space-y-3">
          {releases.map((release) => (
            <li key={release.id}>
              <Link
                href="/certificate"
                className="block rounded-[20px] border border-dove/50 bg-pure-white p-5 shadow-[var(--shadow)] hover:border-dove"
              >
                <p className="text-[16px] font-medium text-ink">{release.name}</p>
                <p className="mt-1 text-[14px] text-ash">
                  {release.status.toLowerCase()}
                  {release.version ? ` · ${release.version}` : ""} ·{" "}
                  {release.incidents.length}{" "}
                  {release.incidents.length === 1 ? "escape" : "escapes"}
                  {release.certificate
                    ? ` · certificate ${release.certificate.decision.toLowerCase()}`
                    : " · unsigned"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
