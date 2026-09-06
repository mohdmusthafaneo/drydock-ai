import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { resolveStoredJiraDelivery } from "@/lib/delivery-analysis/resolve";
import { getIntegrationNavGates } from "@/lib/nav-availability";
import { getOrganizationContext } from "@/lib/org-data";
import { isNavPathEnabled } from "@/lib/feature-flags";
import { resolveLandingPath } from "@/lib/landing-path";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

export async function PlatformShell({
  session,
  children,
}: {
  session: SessionPayload;
  children: React.ReactNode;
}) {
  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { id: true, name: true },
  });

  if (!org) redirect("/login");

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  const search = headersList.get("x-search") ?? headersList.get("x-url") ?? "";
  const useFixtureProjects =
    process.env.NODE_ENV !== "production" &&
    (search.includes("fixture=1") || pathname.includes("fixture=1"));

  const ctx = await getOrganizationContext(session.organizationId);
  const homePath = resolveLandingPath({
    hasDna: Boolean(ctx.dna),
    completedStepIds: ctx.completedStepIds,
  });

  if (pathname && !isNavPathEnabled(pathname)) {
    redirect(homePath);
  }

  const integrationGates = getIntegrationNavGates(ctx.integrations);

  let projects: { key: string; name: string }[] = [];
  if (useFixtureProjects) {
    projects = [
      { key: "WEB", name: "Connexus Web" },
      { key: "MOB", name: "Mobile App" },
      { key: "DATA", name: "Data Platform" },
      { key: "INFRA", name: "Infrastructure" },
    ];
  } else {
    try {
      const stored = await resolveStoredJiraDelivery(session.organizationId);
      if (stored?.snapshot.projects?.length) {
        projects = stored.snapshot.projects.map((p) => ({
          key: p.key,
          name: p.name,
        }));
      }
    } catch {
      projects = [];
    }
  }

  const syncAgg = await prisma.integration.aggregate({
    where: { organizationId: session.organizationId },
    _max: { lastSyncAt: true },
  });
  const lastSyncAt = useFixtureProjects
    ? new Date(Date.now() - 11 * 60 * 1000).toISOString()
    : (syncAgg._max.lastSyncAt?.toISOString() ?? null);

  const fixtureSprints = useFixtureProjects
    ? [
        {
          id: "37",
          label: "Sprint 37 | Aug 10 – Aug 24",
          start: "2026-08-10",
          end: "2026-08-24",
        },
      ]
    : [];

  return (
    <AppShell
      session={session}
      integrationGates={integrationGates}
      homePath={homePath}
      organizationName={useFixtureProjects ? "Connexus" : org.name}
      projects={projects}
      lastSyncAt={lastSyncAt}
      activeSprintLabel={
        useFixtureProjects ? "Aug 10, 2026 – Aug 24, 2026" : undefined
      }
      sprints={fixtureSprints}
      activationMode={false}
      hasDna={Boolean(ctx.dna)}
    >
      <QueryProvider>{children}</QueryProvider>
    </AppShell>
  );
}
