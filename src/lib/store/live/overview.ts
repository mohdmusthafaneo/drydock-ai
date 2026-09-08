import { asDimensioned } from "@/lib/store/dimensions";
import { loadOverviewDashboard } from "@/lib/overview/load-overview";
import type { LiveAdapter } from "@/lib/store/live/types";

/**
 * Overlay Overview leaf from live loaders when the org has non-empty delivery data.
 * Greeting/sprint chrome stay filter-derived on the client.
 */
export const overviewOverlay: LiveAdapter = async (organizationId) => {
  try {
    const model = await loadOverviewDashboard({
      organizationId,
      userName: "User",
      teamKey: null,
      sprintId: null,
      useFixture: false,
    });
    if (model.empty) return {};

    return {
      overview: asDimensioned({
        deliveryConfidence: model.deliveryConfidence,
        keyTakeaways: model.keyTakeaways,
        pillars: model.pillars,
        deliveryTrend: model.deliveryTrend,
        burndown: model.burndown,
        heatmap: model.heatmap,
        attention: model.attention,
        leadership: model.leadership,
        empty: model.empty,
      }),
      meta: {
        lastSyncAt: model.lastSyncAt,
      },
      dimensions: {
        teams: model.teams,
        sprints: model.sprints,
        projects: model.teams.map((t) => ({ key: t.key, name: t.name })),
      },
    };
  } catch {
    return {};
  }
};
