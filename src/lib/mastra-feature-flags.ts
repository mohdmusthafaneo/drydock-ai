/** Phase M3 — opt-in Mastra LLM paths for non-agent surfaces (env-driven). */

function envFlag(name: string, defaultValue = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "true" || raw === "1" || raw === "yes";
}

/** When true, discovery POST enriches Delivery DNA summary via Mastra workflow. */
export function isDiscoveryDnaLlmEnabled(): boolean {
  return envFlag("MASTRA_DISCOVERY_DNA_LLM_ENABLED");
}

/** When true, accelerator generate uses multi-step Mastra workflow with approval gates. */
export function isMvpAcceleratorLlmEnabled(): boolean {
  return envFlag("MASTRA_MVP_ACCELERATOR_LLM_ENABLED");
}

/** When true, external thread ingress may invoke chatRoutingWorkflow directly (stub path). */
export function isAgentThreadIngressMastraEnabled(): boolean {
  return envFlag("MASTRA_AGENT_THREAD_INGRESS_ENABLED", true);
}
