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

type Ctx = {
  hasProfile: boolean;
  hasDna: boolean;
  workflowConfigured: boolean;
  hasRelease: boolean;
  hasAssessedRelease: boolean;
  connectedCount: number;
  pendingApprovals: number;
  toolchainMappingConfirmed: boolean;
  jiraConnected: boolean;
  jiraCalibrationComplete: boolean;
};

function buildOnboardingSteps(ctx: Ctx): OnboardingStep[] {
  const steps: OnboardingStep[] = [
    {
      id: "governance-setup",
      label: "Discovery & Delivery DNA",
      href: "/governance/setup",
      done: ctx.hasProfile && ctx.hasDna,
    },
    {
      id: "integrations",
      label: "Setup integrations",
      href: "/integrations",
      done: ctx.connectedCount >= 1,
    },
    {
      id: "toolchain-mapping",
      label: "Map Jira & GitHub workflows",
      href: "/governance/toolchain-mapping",
      done: ctx.toolchainMappingConfirmed,
    },
  ];

  if (ctx.jiraConnected) {
    steps.push({
      id: "jira-calibration",
      label: "Calibrate Jira workflow (90 days)",
      href: "/governance/toolchain-mapping",
      done: ctx.jiraCalibrationComplete,
    });
  }

  steps.push(
    {
      id: "workflow",
      label: "Configure workflow & autonomy",
      href: "/governance/workflow",
      done: ctx.workflowConfigured,
    },
    {
      id: "release",
      label: "Register & assess a release",
      href: "/workflow",
      done: ctx.hasAssessedRelease,
    },
    {
      id: "approve",
      label: "Complete approval workflow",
      href: "/approvals",
      done: ctx.hasAssessedRelease && ctx.pendingApprovals === 0,
    },
  );

  return steps;
}

export function getOnboardingSteps(ctx: Ctx) {
  return filterEnabledSteps(buildOnboardingSteps(ctx));
}
