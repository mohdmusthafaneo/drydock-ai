import type { DeepPartial } from "@/lib/store/deep";
import type { AppData } from "@/lib/store/types";

export type LiveOverlay = DeepPartial<AppData>;

export type LiveAdapter = (
  organizationId: string,
) => Promise<LiveOverlay>;

/** True when live overlays should run (opt-in; demo stays pure mock by default). */
export function shouldApplyLiveOverlay(): boolean {
  const flag = process.env.DRYDOCK_LIVE_OVERLAY?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "on") return true;
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return false;
}
