import type { CodeAnalysisFilters } from "@/lib/code-analysis/types";

/** Default time window for code-analysis dashboard and executive briefing claims. */
export const DEFAULT_CODE_ANALYSIS_RANGE: CodeAnalysisFilters["range"] = "30d";

export const DEFAULT_CODE_ANALYSIS_FILTERS: Pick<CodeAnalysisFilters, "range"> = {
  range: DEFAULT_CODE_ANALYSIS_RANGE,
};
