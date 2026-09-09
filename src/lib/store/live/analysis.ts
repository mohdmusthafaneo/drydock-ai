import {
  resolveStoredCodeAnalysis,
  snapshotForFilters,
} from "@/lib/code-analysis/sync";
import { DEFAULT_CODE_ANALYSIS_FILTERS } from "@/lib/code-analysis/default-filters";
import type { LiveAdapter } from "@/lib/store/live/types";

export const codeAnalysisOverlay: LiveAdapter = async (organizationId) => {
  try {
    const stored = await resolveStoredCodeAnalysis(organizationId);
    if (!stored) return {};
    const snapshot = snapshotForFilters(stored, DEFAULT_CODE_ANALYSIS_FILTERS);
    return {
      codeAnalysis: {
        snapshot,
        availableRepos: stored.repos,
      },
    };
  } catch {
    return {};
  }
};
