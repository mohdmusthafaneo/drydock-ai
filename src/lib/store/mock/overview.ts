import type { OverviewDashboardModel } from "@/lib/overview/types";
import { METRIC_HREFS, PILLAR_HREFS } from "@/lib/overview/nav-context";
import { type Dimensioned } from "@/lib/store/dimensions";
import type { DeepPartial } from "@/lib/store/deep";
import { TPT_OVERVIEW_DERIVED } from "@/lib/store/mock/tpt-overview-derived";

export const OVERVIEW_LAST_SYNC_AT = TPT_OVERVIEW_DERIVED.lastSyncAt;

type OverviewLeaf = {
  deliveryConfidence: OverviewDashboardModel["deliveryConfidence"];
  keyTakeaways: OverviewDashboardModel["keyTakeaways"];
  pillars: OverviewDashboardModel["pillars"];
  deliveryTrend: OverviewDashboardModel["deliveryTrend"];
  burndown: OverviewDashboardModel["burndown"];
  heatmap: OverviewDashboardModel["heatmap"];
  attention: OverviewDashboardModel["attention"];
  leadership: OverviewDashboardModel["leadership"];
  empty: boolean;
};

/** Leadership approvals are not in the Jira export — keep mock count. */
const MOCK_LEADERSHIP = { count: 1, href: "/approvals" } as const;

function mutableClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type DerivedKpis = {
  score: number;
  band: OverviewDashboardModel["deliveryConfidence"]["band"];
  caption: string;
  completion: number;
  done: number;
  total: number;
  blocked: number;
  spillover: number;
  ai: number;
  takeaways: OverviewDashboardModel["keyTakeaways"];
  pillars: OverviewDashboardModel["pillars"];
  attention_count: number;
  attention_message: string;
};

type DerivedCharts = {
  deliveryTrend: OverviewLeaf["deliveryTrend"];
  burndown: OverviewLeaf["burndown"];
  heatmap: OverviewLeaf["heatmap"];
};

function asKpis(raw: unknown): DerivedKpis {
  return mutableClone(raw) as DerivedKpis;
}

function asCharts(raw: unknown): DerivedCharts {
  return mutableClone(raw) as DerivedCharts;
}

function leafFromDerived(kpis: DerivedKpis, charts: DerivedCharts): OverviewLeaf {
  return {
    deliveryConfidence: {
      score: kpis.score,
      band: kpis.band,
      caption: kpis.caption,
      href: "/delivery-analysis",
      metrics: [
        {
          id: "completion",
          label: "Sprint completion",
          value: `${kpis.completion}%`,
          progress: kpis.completion,
          annotation: `${kpis.done} / ${kpis.total}`,
          icon: "flag",
          href: METRIC_HREFS.completion,
        },
        {
          id: "blocked",
          label: "Items blocked",
          value: kpis.blocked,
          progress: Math.min(100, kpis.blocked),
          icon: "circle-x",
          href: METRIC_HREFS.blocked,
        },
        {
          id: "spillover",
          label: "Items spilling over",
          value: kpis.spillover,
          progress: Math.min(100, kpis.spillover),
          icon: "trend-up",
          href: METRIC_HREFS.spillover,
        },
        {
          id: "ai-risk",
          label: "AI code risk",
          value: `${kpis.ai}%`,
          progress: kpis.ai,
          icon: "x",
          href: METRIC_HREFS["ai-risk"],
        },
      ],
    },
    keyTakeaways: kpis.takeaways,
    pillars: kpis.pillars.map((p) => ({
      ...p,
      href: p.href ?? PILLAR_HREFS[p.id],
    })),
    deliveryTrend: charts.deliveryTrend,
    burndown: charts.burndown,
    heatmap: charts.heatmap,
    attention:
      kpis.attention_count > 0
        ? {
            count: kpis.attention_count,
            message: kpis.attention_message,
            href: "/attention",
          }
        : null,
    leadership: { ...MOCK_LEADERSHIP },
    empty: false,
  };
}

function teamPatch(kpis: DerivedKpis): DeepPartial<OverviewLeaf> {
  const leaf = leafFromDerived(
    kpis,
    asCharts(TPT_OVERVIEW_DERIVED.base.charts),
  );
  return {
    deliveryConfidence: leaf.deliveryConfidence,
    keyTakeaways: leaf.keyTakeaways,
    pillars: leaf.pillars,
    attention: leaf.attention,
  };
}

function sprintOrgPatch(
  kpis: DerivedKpis,
  charts: DerivedCharts,
): DeepPartial<OverviewLeaf> {
  const leaf = leafFromDerived(kpis, charts);
  return {
    deliveryConfidence: leaf.deliveryConfidence,
    keyTakeaways: leaf.keyTakeaways,
    pillars: leaf.pillars,
    attention: leaf.attention,
    leadership: leaf.leadership,
    deliveryTrend: leaf.deliveryTrend,
    burndown: leaf.burndown,
    heatmap: leaf.heatmap,
  };
}

/**
 * Overview fixture from TPT Jira CSV (`tpt-overview-derived.ts`).
 * AI risk, compliance, git/deploy heatmap rows, and leadership stay mocked.
 */
export function buildMockOverview(): Dimensioned<OverviewLeaf> {
  const byTeam: Dimensioned<OverviewLeaf>["byTeam"] = {};
  for (const [key, kpis] of Object.entries(TPT_OVERVIEW_DERIVED.byTeam)) {
    byTeam[key] = teamPatch(asKpis(kpis));
  }

  const bySprint: Dimensioned<OverviewLeaf>["bySprint"] = {};
  for (const [id, entry] of Object.entries(TPT_OVERVIEW_DERIVED.bySprint)) {
    bySprint[id] = sprintOrgPatch(asKpis(entry.kpis), asCharts(entry.charts));
  }

  const byTeamSprint: Dimensioned<OverviewLeaf>["byTeamSprint"] = {};
  for (const [key, kpis] of Object.entries(TPT_OVERVIEW_DERIVED.byTeamSprint)) {
    byTeamSprint[key] = teamPatch(asKpis(kpis));
  }

  return {
    base: leafFromDerived(
      asKpis(TPT_OVERVIEW_DERIVED.base),
      asCharts(TPT_OVERVIEW_DERIVED.base.charts),
    ),
    byTeam,
    bySprint,
    byTeamSprint,
  };
}

/** @deprecated Prefer buildMockOverview; kept for gradual migration. */
export const mockOverviewDimensioned = buildMockOverview();
