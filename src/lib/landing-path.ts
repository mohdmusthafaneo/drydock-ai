import {
  ENTERPRISE_WORKFLOW_STEPS,
} from "@/lib/enterprise-workflow";
import { isNavHrefEnabled } from "@/lib/feature-flags";
import {
  WORKSPACE_META,
  getEnabledHomePath,
  type WorkspaceMode,
} from "@/lib/workspace-mode";

export function isEnterpriseWorkflowComplete(completedStepIds: string[]): boolean {
  const done = new Set(completedStepIds);
  return ENTERPRISE_WORKFLOW_STEPS.every((step) => done.has(step.id));
}

export function resolveLandingPath(input: {
  mode: WorkspaceMode;
  hasDna: boolean;
  completedStepIds?: string[];
}): string {
  if (input.mode === "MVP") {
    if (isNavHrefEnabled("/accelerator")) return WORKSPACE_META.MVP.homePath;
    return getEnabledHomePath("MVP");
  }

  if (!input.hasDna && isNavHrefEnabled("/governance")) {
    return "/governance/setup";
  }

  if (isNavHrefEnabled("/dashboard")) {
    return "/dashboard";
  }

  if (isNavHrefEnabled("/workflow")) {
    return "/workflow";
  }

  return getEnabledHomePath("ENTERPRISE");
}
