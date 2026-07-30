import {
  ENTERPRISE_WORKFLOW_STEPS,
} from "@/lib/enterprise-workflow";
import { isNavHrefEnabled } from "@/lib/feature-flags";
import { getEnabledHomePath } from "@/lib/workspace-mode";

export function isEnterpriseWorkflowComplete(completedStepIds: string[]): boolean {
  const done = new Set(completedStepIds);
  return ENTERPRISE_WORKFLOW_STEPS.every((step) => done.has(step.id));
}

export function resolveLandingPath(input: {
  hasDna: boolean;
  completedStepIds?: string[];
}): string {
  if (!input.hasDna) {
    return "/activate";
  }

  if (isNavHrefEnabled("/dashboard")) {
    return "/dashboard";
  }

  if (isNavHrefEnabled("/workflow")) {
    return "/workflow";
  }

  return getEnabledHomePath("ENTERPRISE");
}
