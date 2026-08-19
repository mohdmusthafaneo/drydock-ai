import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getOrganizationContext } from "@/lib/org-data";
import { getOnboardingSteps, isOrgActivated } from "@/lib/onboarding";
import { isIntegrationHealthyLite } from "@/lib/integration-health";
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

function isChatPath(pathname: string): boolean {
  return pathname === "/agent-threads" || pathname.startsWith("/agent-threads/");
}
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

  const hasDeliverySourceSynced = ctx.integrations.some(
    (i) =>
      (i.provider === "JIRA" || i.provider === "GITHUB") && i.lastSyncAt != null,
  );
  const activationMode = !isOrgActivated({
    hasDna: Boolean(ctx.dna),
    hasDeliverySourceSynced,
  });

  const steps = getOnboardingSteps({
    hasProfile: Boolean(ctx.profile?.completedAt),
    hasDna: Boolean(ctx.dna),
    hasHealthyIntegration: ctx.integrations.some(isIntegrationHealthyLite),
    hasSuccessfulSync: ctx.integrations.some((i) => i.lastSyncAt != null),
    hasFirstDecision: ctx.approvals.some((a) => a.approverId != null),
    hasPendingLeadershipDecision: ctx.stats.pendingApprovals > 0,
  });

  return (
    <AppShell
      session={session}
      integrationGates={integrationGates}
      homePath={homePath}
      activationMode={activationMode}
      hasDna={Boolean(ctx.dna)}
    >
      {!isChatPath(pathname) ? <OnboardingBanner steps={steps} /> : null}
      <QueryProvider>{children}</QueryProvider>
    </AppShell>
  );
}
