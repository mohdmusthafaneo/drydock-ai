import { deepMerge, type DeepPartial } from "@/lib/store/deep";
import type { AppData } from "@/lib/store/types";
import { codeAnalysisOverlay } from "@/lib/store/live/analysis";
import {
  briefingOverlay,
  certificateOverlay,
  escapesOverlay,
  ledgerOverlay,
  standardOverlay,
} from "@/lib/store/live/trust";
import { orgOverlay } from "@/lib/store/live/org";
import type { LiveAdapter, LiveOverlay } from "@/lib/store/live/types";

const ADAPTERS: LiveAdapter[] = [
  orgOverlay,
  ledgerOverlay,
  briefingOverlay,
  certificateOverlay,
  standardOverlay,
  escapesOverlay,
  codeAnalysisOverlay,
];

/**
 * Run all live adapters and deep-merge their overlays.
 * Adapters return `{}` when the org has no meaningful live data, so mock
 * fields remain until real rows exist — no env flip required.
 */
export async function buildLiveOverlay(
  organizationId: string,
): Promise<LiveOverlay> {
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

export type { LiveOverlay, LiveAdapter } from "@/lib/store/live/types";
