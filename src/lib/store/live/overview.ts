import { asDimensioned } from "@/lib/store/dimensions";
import { loadOverviewDashboard } from "@/lib/overview/load-overview";
import { getMockAppData } from "@/lib/store/mock";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import type { OverviewLeaf } from "@/lib/store/types";
import type { LiveAdapter } from "@/lib/store/live/types";

function isSparseTrend(trend: OverviewDashboardModel["deliveryTrend"]): boolean {
  const points = trend.points ?? [];
  if (points.length < 3) return true;
  const values = points.map((p) => p.value);
  return Math.max(...values) - Math.min(...values) < 8;
}

function isEmptyHeatmap(heatmap: OverviewDashboardModel["heatmap"]): boolean {
  const rows = heatmap.rows ?? [];
  if (rows.length === 0) return true;
  return rows.every((row) => row.cells.every((cell) => cell <= 0));
}

function isEmptyBurndown(burndown: OverviewDashboardModel["burndown"]): boolean {
  return (burndown.ideal?.length ?? 0) === 0 && (burndown.actual?.length ?? 0) === 0;
}

function liveChartsReady(model: OverviewDashboardModel): boolean {
  return (
    !isSparseTrend(model.deliveryTrend) &&
    !isEmptyBurndown(model.burndown) &&
    !isEmptyHeatmap(model.heatmap)
  );
}

/** When live has no WoW snapshot yet, keep Connexus demo ↑/↓ chips on pillar scores. */
function pillarsWithDeltaFallback(
  live: OverviewDashboardModel["pillars"],
  mock: OverviewDashboardModel["pillars"],
): OverviewDashboardModel["pillars"] {
  if (live.length === 0) return mock;
  const demoDelta = new Map(mock.map((p) => [p.id, p.delta]));
  return live.map((p) => ({
    ...p,
    // Fill each missing chip — don't skip the whole set when only one live delta exists.
    delta: p.delta ?? demoDelta.get(p.id) ?? null,
  }));
}

/**
 * Overlay Overview leaf from live loaders when the org has non-empty delivery data.
 * Greeting/sprint chrome stay filter-derived on the client.
 *
 * Chart trio (trend / burndown / heatmap) is replaced only when live data is rich
 * enough on all three — otherwise Connexus demo series stay visible.
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

    const mock = getMockAppData();
    const leaf: Partial<OverviewLeaf> = {
      deliveryConfidence: model.deliveryConfidence,
      keyTakeaways: model.keyTakeaways,
      pillars: pillarsWithDeltaFallback(model.pillars, mock.overview.base.pillars),
      attention: model.attention,
      leadership: model.leadership,
      empty: model.empty,
    };

    if (liveChartsReady(model)) {
      leaf.deliveryTrend = model.deliveryTrend;
      leaf.burndown = model.burndown;
      leaf.heatmap = model.heatmap;
    }

    const liveSprints = model.sprints ?? [];
    const sprints = liveSprints.length >= 2 ? liveSprints : mock.dimensions.sprints;

    return {
      overview: asDimensioned(leaf as OverviewLeaf),
      meta: {
        lastSyncAt: model.lastSyncAt,
      },
      dimensions: {
        teams: model.teams.length > 0 ? model.teams : mock.dimensions.teams,
        sprints,
        projects:
          model.teams.length > 0
            ? model.teams.map((t) => ({ key: t.key, name: t.name }))
            : mock.dimensions.projects,
      },
    };
  } catch {
    return {};
  }
};
