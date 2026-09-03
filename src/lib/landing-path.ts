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
  // DryDock: Briefing is home. DNA activation funnel is sunsetted for the pilot.
  if (isNavHrefEnabled("/briefing")) {
    return "/briefing";
  }

  if (isNavHrefEnabled("/ledger")) {
    return "/ledger";
  }

  return getEnabledHomePath("ENTERPRISE");
}
