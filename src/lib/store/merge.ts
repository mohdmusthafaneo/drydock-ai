import { deepMerge, type DeepPartial } from "@/lib/store/deep";
import type { AppData } from "@/lib/store/types";

/** Deep-merge a partial overlay onto seed AppData. */
export function mergeAppData(
  base: AppData,
  overlay: DeepPartial<AppData> | undefined | null,
): AppData {
  if (!overlay) return base;
  return deepMerge(base, overlay);
}
