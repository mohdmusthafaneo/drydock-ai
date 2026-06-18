import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getOrganizationContext } from "@/lib/org-data";
import { getOnboardingSteps } from "@/lib/onboarding";
import { OnboardingBanner } from "@/components/layout/onboarding-banner";
import { AppShell } from "@/components/layout/app-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";
import { isNavPathEnabled } from "@/lib/feature-flags";
import { resolveLandingPath } from "@/lib/landing-path";
import {
  getIntegrationNavGates,
  isIntegrationGatedPathAccessible,
} from "@/lib/nav-availability";
import { isMvpOnlyPath } from "@/lib/workspace-mode";

export async function PlatformShell({
  session,
  children,
}: {
  session: SessionPayload;
  children: React.ReactNode;
}) {
  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { id: true },
  });

  if (!org) redirect("/login");

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  if (pathname && isMvpOnlyPath(pathname)) {
    redirect("/dashboard");
  }

  const ctx = await getOrganizationContext(session.organizationId);
  const homePath = resolveLandingPath({
    hasDna: Boolean(ctx.dna),
    completedStepIds: ctx.completedStepIds,
  });

  if (pathname && !isNavPathEnabled(pathname)) {
    redirect(homePath);
  }

  const integrationGates = getIntegrationNavGates(ctx.integrations);

  if (
    pathname &&
    isNavPathEnabled(pathname) &&
    !isIntegrationGatedPathAccessible(pathname, integrationGates)
  ) {
    redirect("/integrations");
  }

  const [
    releaseCount,
    assessedReleaseCount,
    workflowConfigured,
  ] = await Promise.all([
    prisma.release.count({ where: { organizationId: session.organizationId } }),
    prisma.release.count({
      where: {
        organizationId: session.organizationId,
        assessedAt: { not: null },
      },
    }),
    prisma.deliveryWorkflow.findUnique({
      where: { organizationId: session.organizationId },
      select: { configuredAt: true },
    }),
  ]);

  const steps = getOnboardingSteps({
    hasProfile: Boolean(ctx.profile?.completedAt),
    hasDna: Boolean(ctx.dna),
    workflowConfigured: Boolean(workflowConfigured?.configuredAt),
    hasRelease: releaseCount > 0,
    hasAssessedRelease: assessedReleaseCount > 0,
    connectedCount: ctx.integrations.filter((i) => i.status === "CONNECTED").length,
    pendingApprovals: ctx.stats.pendingApprovals,
    toolchainMappingConfirmed: Boolean(ctx.profile?.toolchainMappingConfirmedAt),
  });

  return (
    <AppShell
      session={session}
      integrationGates={integrationGates}
      homePath={homePath}
    >
      <OnboardingBanner steps={steps} />
      <QueryProvider>{children}</QueryProvider>
    </AppShell>
  );
}
