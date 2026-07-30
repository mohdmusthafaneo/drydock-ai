import {
  aidosTools,
  AIDOS_TOOL_IDS,
  type AidosToolId,
  type AidosToolMap,
} from "../tools/aidos";

/** Fixed read-only toolset for the single AIDOS assistant. */
export const ASSISTANT_TOOL_IDS: readonly AidosToolId[] = AIDOS_TOOL_IDS;

export function getAidosToolsForAssistant(): Record<
  string,
  AidosToolMap[AidosToolId]
> {
  const tools: Record<string, AidosToolMap[AidosToolId]> = {};
  for (const toolId of ASSISTANT_TOOL_IDS) {
    tools[toolId] = aidosTools[toolId];
  }
  return tools;
}

export function listAidosToolIdsForAssistant(): AidosToolId[] {
  return [...ASSISTANT_TOOL_IDS];
}
