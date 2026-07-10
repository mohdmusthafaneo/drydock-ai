export type LlmFeature =
  | "executive_briefing"
  | "code_analysis_enrich"
  | "jira_calibration"
  | "agent_heartbeat"
  | "evidence"
  | "ml_code_quality";

const FEATURE_ENV: Record<LlmFeature, string> = {
  executive_briefing: "LLM_FEATURE_EXECUTIVE_BRIEFING",
  code_analysis_enrich: "LLM_FEATURE_CODE_ANALYSIS_ENRICH",
  jira_calibration: "LLM_FEATURE_JIRA_CALIBRATION",
  agent_heartbeat: "LLM_FEATURE_AGENT_HEARTBEAT",
  evidence: "LLM_FEATURE_EVIDENCE",
  ml_code_quality: "LLM_FEATURE_ML_CODE_QUALITY",
};

/**
 * Per-feature kill-switch. Default enabled unless env is `0`/`false`.
 * Global kill: `LLM_KILL_SWITCH=true` disables all features.
 */
export function isLlmFeatureEnabled(feature: LlmFeature): boolean {
  const global = process.env.LLM_KILL_SWITCH?.trim().toLowerCase();
  if (global === "1" || global === "true") return false;

  const key = FEATURE_ENV[feature];
  const raw = process.env[key];
  if (raw === undefined) return true;
  return raw !== "0" && raw.toLowerCase() !== "false";
}
