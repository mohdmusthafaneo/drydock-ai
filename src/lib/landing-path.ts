import {
  getEnabledHomePath,
} from "@/lib/workspace-mode";
import { isNavHrefEnabled } from "@/lib/feature-flags";

export function isEnterpriseWorkflowComplete(completedStepIds: string[]): boolean {
  // Retained for callers; DryDock no longer gates on AIDOS workflow steps.
  return completedStepIds.length > 0;
}

export function resolveLandingPath(_input: {
  hasDna: boolean;
  completedStepIds?: string[];
}): string {
  if (isNavHrefEnabled("/dashboard")) {
    return "/dashboard";
  }

  if (isNavHrefEnabled("/briefing")) {
    return "/briefing";
  }

  if (isNavHrefEnabled("/ledger")) {
    return "/ledger";
  }

  return getEnabledHomePath("ENTERPRISE");
}
