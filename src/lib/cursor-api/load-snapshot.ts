import { resolveMockSeed } from "@/lib/store/mock";
import { buildCursorAiSnapshotFromProductivity } from "@/lib/store/mock/ai-snapshot";
import { pick } from "@/lib/store/dimensions";
import type { CursorAiSnapshot } from "@/lib/cursor-api/types";

/**
 * Server-side AI snapshot from the same AppData mock packs used by Overview /
 * Productivity. Does not call the external cursor-api.
 */
export function loadCursorAiSnapshot(input?: {
  email?: string | null;
  teamKey?: string | null;
  sprintId?: string | null;
}): CursorAiSnapshot {
  const data = resolveMockSeed({ email: input?.email?.trim() || "" });
  const sprintId =
    input?.sprintId ??
    data.dimensions.sprints.find((s) => s.id === data.dimensions.defaultSprintId)
      ?.id ??
    data.dimensions.defaultSprintId;

  const productivity = pick(data.productivity, {
    team: input?.teamKey ?? null,
    sprint: sprintId,
  });

  return buildCursorAiSnapshotFromProductivity({
    productivity,
    dimensions: data.dimensions,
    lastSyncAt: data.meta.lastSyncAt,
  });
}
