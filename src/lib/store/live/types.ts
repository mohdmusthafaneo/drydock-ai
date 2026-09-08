import type { DeepPartial } from "@/lib/store/deep";
import type { AppData } from "@/lib/store/types";

export type LiveOverlay = DeepPartial<AppData>;

export type LiveAdapter = (
  organizationId: string,
) => Promise<LiveOverlay>;
