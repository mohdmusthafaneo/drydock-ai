import { isNavPathEnabled } from "@/lib/feature-flags";

type OnboardingStep = {
  id: string;
  label: string;
  href: string;
  done: boolean;
};

function filterEnabledSteps(steps: OnboardingStep[]): OnboardingStep[] {
  return steps.filter((step) => isNavPathEnabled(step.href));
}

export type OnboardingCtx = {
  hasProfile: boolean;
  hasDna: boolean;
  hasHealthyIntegration: boolean;
  hasSuccessfulSync: boolean;
  hasFirstDecision: boolean;
  /** When false and prior milestones are met, first-decision is skipped (nothing to decide yet). */
  hasPendingLeadershipDecision: boolean;
};

/**
 * First decision is complete when a human signed off, or when the org is past
 * connect/sync and there is nothing in the leadership Approval Center — mature
 * orgs must not stay stuck on this banner forever.
 */
export function isFirstDecisionMilestoneDone(ctx: OnboardingCtx): boolean {
  if (ctx.hasFirstDecision) return true;
  if (!ctx.hasHealthyIntegration || !ctx.hasSuccessfulSync) return false;
  return !ctx.hasPendingLeadershipDecision;
}

function buildOnboardingSteps(ctx: OnboardingCtx): OnboardingStep[] {
  return [
    {
      id: "workspace-ready",
      label: "Workspace ready",
      href: "/governance/setup",
      done: ctx.hasProfile && ctx.hasDna,
    },
    {
      id: "first-healthy-integration",
      label: "First healthy integration",
      href: "/integrations",
      done: ctx.hasHealthyIntegration,
    },
    {
      id: "first-successful-sync",
      label: "First successful sync",
      href: "/integrations",
      done: ctx.hasSuccessfulSync,
    },
    {
      id: "first-decision",
      label: "First decision",
      href: "/approvals",
      done: isFirstDecisionMilestoneDone(ctx),
    },
  ];
}

export function getOnboardingSteps(ctx: OnboardingCtx) {
  return filterEnabledSteps(buildOnboardingSteps(ctx));
}

/** DNA + at least one delivery source (Jira or GitHub) synced — exit activate mode. */
export function isOrgActivated(input: {
  hasDna: boolean;
  hasDeliverySourceSynced: boolean;
}): boolean {
  return input.hasDna && input.hasDeliverySourceSynced;
}
