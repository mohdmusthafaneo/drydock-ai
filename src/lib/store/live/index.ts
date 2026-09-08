import { deepMerge, type DeepPartial } from "@/lib/store/deep";
import type { AppData } from "@/lib/store/types";
import { overviewOverlay } from "@/lib/store/live/overview";
import {
  codeAnalysisOverlay,
  deliveryAnalysisOverlay,
} from "@/lib/store/live/analysis";
import {
  briefingOverlay,
  certificateOverlay,
  escapesOverlay,
  ledgerOverlay,
  standardOverlay,
} from "@/lib/store/live/trust";
import { orgOverlay } from "@/lib/store/live/org";
import {
  shouldApplyLiveOverlay,
  type LiveAdapter,
  type LiveOverlay,
} from "@/lib/store/live/types";

const ADAPTERS: LiveAdapter[] = [
  orgOverlay,
  overviewOverlay,
  ledgerOverlay,
  briefingOverlay,
  certificateOverlay,
  standardOverlay,
  escapesOverlay,
  codeAnalysisOverlay,
  deliveryAnalysisOverlay,
];

/**
 * Run all live adapters and deep-merge their overlays.
 * Returns null when live overlay is disabled (demo stays pure mock).
 * Individual adapters return {} when the org has no meaningful live data,
 * so mock fields remain until you opt a domain in.
 */
export async function buildLiveOverlay(
  organizationId: string,
): Promise<LiveOverlay | null> {
  if (!shouldApplyLiveOverlay()) return null;

  const parts = await Promise.all(
    ADAPTERS.map(async (adapter) => {
      try {
        return await adapter(organizationId);
      } catch {
        return {} as LiveOverlay;
      }
    }),
  );

  let merged: DeepPartial<AppData> = {};
  for (const part of parts) {
    merged = deepMerge(merged, part);
  }

  return merged;
}

export { shouldApplyLiveOverlay } from "@/lib/store/live/types";
export type { LiveOverlay, LiveAdapter } from "@/lib/store/live/types";
