import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getOrganizationContext } from "@/lib/org-data";
import { getOnboardingSteps } from "@/lib/onboarding";
import { OnboardingBanner } from "@/components/layout/onboarding-banner";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";
import { isNavPathEnabled } from "@/lib/feature-flags";
import { resolveLandingPath } from "@/lib/landing-path";
import {
  getIntegrationNavGates,
  isIntegrationGatedPathAccessible,
} from "@/lib/nav-availability";
import {
  getHomePath,
  isEnterpriseOnlyPath,
  isMvpOnlyPath,
  type WorkspaceMode,
} from "@/lib/workspace-mode";

export async function PlatformShell({
  session,
  children,
}: {
  session: SessionPayload;
  children: React.ReactNode;
}) {
  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { workspaceMode: true },
  });

  if (!org) redirect("/login");

  const workspaceMode = org.workspaceMode as WorkspaceMode;

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  if (workspaceMode === "MVP" && pathname && isEnterpriseOnlyPath(pathname)) {
    redirect(getHomePath("MVP", true));
  }
  if (workspaceMode === "ENTERPRISE" && pathname && isMvpOnlyPath(pathname)) {
    redirect(getHomePath("ENTERPRISE", true));
  }

  const ctx = await getOrganizationContext(session.organizationId);
  const homePath = resolveLandingPath({
    mode: workspaceMode,
    hasDna: Boolean(ctx.dna),
    completedStepIds:
      workspaceMode === "ENTERPRISE" ? ctx.completedStepIds : undefined,
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
    acceleratorCount,
    generatedPackageCount,
    approvedAcceleratorCount,
    releaseCount,
    assessedReleaseCount,
    workflowConfigured,
  ] = await Promise.all([
    prisma.acceleratorProject.count({
      where: { organizationId: session.organizationId },
    }),
    prisma.acceleratorProject.count({
      where: {
        organizationId: session.organizationId,
        prdMarkdown: { not: null },
      },
    }),
    prisma.acceleratorProject.count({
      where: { organizationId: session.organizationId, status: "APPROVED" },
    }),
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
    mode: workspaceMode,
    hasProfile: Boolean(ctx.profile?.completedAt),
    hasDna: Boolean(ctx.dna),
    workflowConfigured: Boolean(workflowConfigured?.configuredAt),
    hasAcceleratorProject: acceleratorCount > 0,
    hasGeneratedPackage: generatedPackageCount > 0,
    hasApprovedAccelerator: approvedAcceleratorCount > 0,
    hasRelease: releaseCount > 0,
    hasAssessedRelease: assessedReleaseCount > 0,
    connectedCount: ctx.integrations.filter((i) => i.status === "CONNECTED").length,
    pendingApprovals: ctx.stats.pendingApprovals,
  });

  return (
    <AppShell
      session={session}
      workspaceMode={workspaceMode}
      integrationGates={integrationGates}
      homePath={homePath}
    >
      <OnboardingBanner steps={steps} workspaceMode={workspaceMode} />
      {children}
    </AppShell>
  );
}
