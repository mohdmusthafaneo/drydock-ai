import type { WorkspaceMode } from "@/lib/workspace-mode";

type Ctx = {
  mode: WorkspaceMode;
  hasProfile: boolean;
  hasDna: boolean;
  workflowConfigured: boolean;
  hasAcceleratorProject: boolean;
  hasGeneratedPackage: boolean;
  hasApprovedAccelerator: boolean;
  hasRelease: boolean;
  hasAssessedRelease: boolean;
  connectedCount: number;
  pendingApprovals: number;
};

export function getOnboardingSteps(ctx: Ctx) {
  if (ctx.mode === "MVP") {
    return [
      {
        id: "first-mvp",
        label: "Create your first MVP",
        href: "/accelerator/new",
        done: ctx.hasAcceleratorProject,
      },
      {
        id: "generate",
        label: "Generate delivery package",
        href: "/accelerator",
        done: ctx.hasGeneratedPackage,
      },
      {
        id: "approve-mvp",
        label: "Approve MVP package",
        href: "/accelerator",
        done: ctx.hasApprovedAccelerator,
      },
      {
        id: "tools",
        label: "Connect GitHub or Jira",
        href: "/integrations",
        done: ctx.connectedCount > 0,
      },
    ];
  }

  return [
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
      done: ctx.connectedCount >= 2,
    },
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
  ];
}
