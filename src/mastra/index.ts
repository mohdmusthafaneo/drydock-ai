import type { Mastra } from "@mastra/core/mastra";

import { createMastraInstance } from "./server";

let mastraInstance: Mastra | null = null;

/** Lazy Mastra singleton for Next.js worker and API routes (no top-level await). */
export async function getMastra(): Promise<Mastra> {
  if (!mastraInstance) {
    mastraInstance = createMastraInstance();
  }
  return mastraInstance;
}

export { createMastraInstance } from "./server";
export type { CreateMastraOptions } from "./server";
export { resolveMastraModelConfig } from "./config/models";
export {
  resolveMastraObservabilityPath,
  resolveMastraStorageUrl,
} from "./config/storage";
export {
  aidosAgents,
  getAidosAgentForType,
  getMastraAgentIdForType,
} from "./agents";
export {
  createAidosRequestContext,
  createAidosToolContext,
  aidosTools,
  AIDOS_TOOL_IDS,
} from "./tools/aidos";
export { loadAgentInstructionContext } from "./context/instructions";
