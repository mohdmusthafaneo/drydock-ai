import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { ShowcaseStatusBoot } from "@/components/store/showcase-status-boot";
import { getIntegrationNavGates } from "@/lib/nav-availability";
import { getOrganizationContext } from "@/lib/org-data";
import { isNavPathEnabled } from "@/lib/feature-flags";
import { resolveLandingPath } from "@/lib/landing-path";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";
import { AppDataProvider, FilterUrlSync } from "@/lib/store";
import type { DeepPartial } from "@/lib/store/deep";
import type { AppData } from "@/lib/store/types";

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

  const ctx = await getOrganizationContext(session.organizationId);
  const homePath = resolveLandingPath({
    hasDna: Boolean(ctx.dna),
    completedStepIds: ctx.completedStepIds,
  });

  if (pathname && !isNavPathEnabled(pathname)) {
    redirect(homePath);
  }

  const integrationGates = getIntegrationNavGates(ctx.integrations);
  const greetingName = session.name.split(/\s+/)[0] || session.name;

  const overlay: DeepPartial<AppData> = {
    user: {
      name: session.name,
      greetingName,
      role: session.role,
    },
  };

  return (
    <AppDataProvider initialStatus="loading" overlay={overlay}>
      <FilterUrlSync />
      <ShowcaseStatusBoot />
      <AppShell
        session={session}
        integrationGates={integrationGates}
        homePath={homePath}
        activationMode={false}
        hasDna={Boolean(ctx.dna)}
      >
        <QueryProvider>{children}</QueryProvider>
      </AppShell>
    </AppDataProvider>
  );
}
