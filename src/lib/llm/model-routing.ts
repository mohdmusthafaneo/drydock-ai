export type ModelTier = "default" | "cheap";

export type RoutedModel = {
  tier: ModelTier;
  model: string;
};

/**
 * Cheap-model routing for bulk / low-stakes scoring.
 * Override with LLM_MODEL_DEFAULT / LLM_MODEL_CHEAP.
 */
export function resolveModelForFeature(
  feature: string,
  preferred: ModelTier = "default",
): RoutedModel {
  const defaultModel =
    process.env.LLM_MODEL_DEFAULT?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "MiniMax-M3";
  const cheapModel =
    process.env.LLM_MODEL_CHEAP?.trim() ||
    process.env.LLM_MODEL_DEFAULT?.trim() ||
    defaultModel;

  // Bulk scoring features prefer cheap unless explicitly overridden.
  const bulkFeatures = new Set([
    "code_analysis_enrich",
    "ml_code_quality",
    "jira_calibration",
  ]);
  const tier =
    preferred === "cheap" || bulkFeatures.has(feature) ? "cheap" : "default";

  return {
    tier,
    model: tier === "cheap" ? cheapModel : defaultModel,
  };
}
