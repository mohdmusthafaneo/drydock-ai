/**
 * Workflow autonomy modes for Delivery DNA / governance setup.
 * (Agent orchestration roster removed — chat uses in-process AIDOS Assistant.)
 */
export const WORKFLOW_MODES = [
  { mode: "OBSERVE", label: "Observe", description: "AI monitors only — no recommendations" },
  { mode: "RECOMMEND", label: "Recommend", description: "AI proposes — humans decide" },
  { mode: "ASSIST", label: "Assist", description: "AI prepares actions — approval required" },
  { mode: "SEMI_AUTONOMOUS", label: "Semi-Autonomous", description: "Limited auto-execution within policy" },
] as const;
