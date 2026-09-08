"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { releaseStatusLabel } from "@/lib/governance/presentation";
import { useAppData } from "@/lib/store";

export function ReleasesListFromStore() {
  const releases = useAppData((s) => s.data.releases.items);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Releases"
        description="Each release is a decision. Open one to review trust counts and record a sign-off."
      >
        <Link
          href="/releases/new"
          className="rounded-full bg-ink px-4 py-2 text-[14px] text-pure-white"
        >
          Add release
        </Link>
      </PageHeader>

      {releases.length === 0 ? (
        <p className="text-[15px] text-ash">
          No releases added yet. The Tests page still shows the current trust count.
        </p>
      ) : (
        <ul className="space-y-3">
          {releases.map((release) => (
            <li key={release.id}>
              <Link
                href={`/releases/${release.id}`}
                className="block rounded-[var(--radius-card)] border border-dove/50 bg-pure-white p-5 shadow-[var(--shadow)] hover:border-dove"
              >
                <p className="text-[16px] font-medium text-ink">{release.name}</p>
                <p className="mt-1 text-[14px] text-ash">
                  {[
                    releaseStatusLabel(release.status).toLowerCase(),
                    release.version,
                    `${release.incidentCount} ${
                      release.incidentCount === 1 ? "production miss" : "production misses"
                    }`,
                    release.certificateDecision
                      ? `sign-off ${release.certificateDecision.toLowerCase().replace("_", " ")}`
                      : "not signed yet",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
