import {
  resolveStoredCodeAnalysis,
  snapshotForFilters,
} from "@/lib/code-analysis/sync";
import { DEFAULT_CODE_ANALYSIS_FILTERS } from "@/lib/code-analysis/default-filters";
import {
  deliveryAnalysisForFilters,
  resolveStoredJiraDelivery,
} from "@/lib/delivery-analysis/resolve";
import type { DeliveryAnalysisFilters } from "@/lib/delivery-analysis/types";
import type { LiveAdapter, LiveOverlay } from "@/lib/store/live/types";

const DEFAULT_DELIVERY_FILTERS: DeliveryAnalysisFilters = {
  projectKey: null,
  riskFocus: "all",
  range: "30d",
  compare: "previous_sync",
};

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

export const deliveryAnalysisOverlay: LiveAdapter = async (organizationId) => {
  try {
    const stored = await resolveStoredJiraDelivery(organizationId);
    if (!stored?.snapshot) return {};
    const snapshot = deliveryAnalysisForFilters(
      stored,
      DEFAULT_DELIVERY_FILTERS,
    );
    const overlay: LiveOverlay = {
      deliveryAnalysis: { snapshot },
      dimensions: {
        projects: stored.snapshot.projects.map((p) => ({
          key: p.key,
          name: p.name,
        })),
      },
    };
    return overlay;
  } catch {
    return {};
  }
};
