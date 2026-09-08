import {
  collectProvenancePaths,
  deepMerge,
  type DeepPartial,
} from "@/lib/store/deep";
import type { AppData, AppDataMeta } from "@/lib/store/types";

/**
 * Deep-merge a live overlay onto mock AppData and stamp provenance.
 * Paths present in the overlay are marked `"live"`; everything else stays `"mock"`.
 */
export function mergeAppData(
  mock: AppData,
  overlay: DeepPartial<AppData> | undefined | null,
): AppData {
  if (!overlay) {
    return {
      ...mock,
      meta: {
        ...mock.meta,
        mode: "mock",
        provenance: {},
      },
    };
  }

  const merged = deepMerge(mock, overlay);
  const livePaths = collectProvenancePaths(overlay);
  const provenance: AppDataMeta["provenance"] = {};
  for (const path of livePaths) {
    provenance[path] = "live";
  }

  const hasLive = livePaths.length > 0;
  const mode: AppDataMeta["mode"] = hasLive ? "hybrid" : "mock";

  const stampProvenance = (
    extra?: DeepPartial<AppDataMeta["provenance"]> | AppDataMeta["provenance"],
  ): AppDataMeta["provenance"] => {
    const next: AppDataMeta["provenance"] = { ...provenance };
    if (extra) {
      for (const [path, kind] of Object.entries(extra)) {
        if (kind === "mock" || kind === "live") next[path] = kind;
      }
    }
    return next;
  };

  // If overlay explicitly set mode to live and covered everything, respect it.
  if (overlay.meta?.mode === "live") {
    return {
      ...merged,
      meta: {
        ...merged.meta,
        mode: "live",
        provenance: stampProvenance(overlay.meta.provenance),
      },
    };
  }

  return {
    ...merged,
    meta: {
      ...merged.meta,
      mode,
      provenance: stampProvenance(overlay.meta?.provenance),
      lastSyncAt:
        overlay.meta?.lastSyncAt !== undefined
          ? (overlay.meta.lastSyncAt as string | null)
          : merged.meta.lastSyncAt,
    },
  };
}
