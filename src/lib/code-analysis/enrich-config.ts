export function isCodeAnalysisEnrichEnabled(): boolean {
  const raw = process.env.CODE_ANALYSIS_ENRICH_ENABLED;
  if (raw === undefined) return true;
  return raw !== "0" && raw.toLowerCase() !== "false";
}

export function isLlmAvailable(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  );
}
