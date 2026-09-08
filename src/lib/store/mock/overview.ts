import type { OverviewDashboardModel } from "@/lib/overview/types";
import { METRIC_HREFS, PILLAR_HREFS } from "@/lib/overview/nav-context";
import { type Dimensioned } from "@/lib/store/dimensions";
import type { DeepPartial } from "@/lib/store/deep";

export const OVERVIEW_LAST_SYNC_AT = "2026-08-24T10:49:00.000Z";

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

type TeamVariant = {
  score: number;
  band: OverviewDashboardModel["deliveryConfidence"]["band"];
  caption: string;
  completion: { value: string; progress: number; annotation: string };
  blocked: number;
  spillover: number;
  aiRisk: string;
  aiRiskProgress: number;
  takeaways: OverviewDashboardModel["keyTakeaways"];
  pillars: OverviewDashboardModel["pillars"];
  attentionMessage: string;
};

function leafFromVariant(variant: TeamVariant): OverviewLeaf {
  return {
    deliveryConfidence: {
      score: variant.score,
      band: variant.band,
      caption: variant.caption,
      href: "/delivery-analysis",
      metrics: [
        {
          id: "completion",
          label: "Sprint completion",
          value: variant.completion.value,
          progress: variant.completion.progress,
          annotation: variant.completion.annotation,
          icon: "flag",
          href: METRIC_HREFS.completion,
        },
        {
          id: "blocked",
          label: "Items blocked",
          value: variant.blocked,
          progress: Math.min(100, variant.blocked),
          icon: "circle-x",
          href: METRIC_HREFS.blocked,
        },
        {
          id: "spillover",
          label: "Items spilling over",
          value: variant.spillover,
          progress: Math.min(100, variant.spillover),
          icon: "trend-up",
          href: METRIC_HREFS.spillover,
        },
        {
          id: "ai-risk",
          label: "AI code risk",
          value: variant.aiRisk,
          progress: variant.aiRiskProgress,
          icon: "x",
          href: METRIC_HREFS["ai-risk"],
        },
      ],
    },
    keyTakeaways: variant.takeaways,
    pillars: variant.pillars,
    deliveryTrend: SPRINT_37_TREND,
    burndown: SPRINT_37_BURNDOWN,
    heatmap: SPRINT_37_HEATMAP,
    attention: {
      count: 2,
      message: variant.attentionMessage,
      href: "/attention",
    },
    leadership: { count: 1, href: "/approvals" },
    empty: false,
  };
}

/** Sprint 37 charts — matches Overview mockup (declining confidence, behind plan). */
const SPRINT_37_TREND: OverviewLeaf["deliveryTrend"] = {
  rangeLabel: "Last 6 weeks",
  target: 75,
  points: [
    { label: "Jul 13", value: 94 },
    { label: "Jul 16", value: 82 },
    { label: "Jul 20", value: 76 },
    { label: "Jul 23", value: 68 },
    { label: "Jul 27", value: 59 },
    { label: "Jul 30", value: 48 },
    { label: "Aug 3", value: 41 },
    { label: "Aug 10", value: 34 },
    { label: "Aug 17", value: 28 },
    { label: "Aug 24", value: 22 },
  ],
};

const SPRINT_37_BURNDOWN: OverviewLeaf["burndown"] = {
  completed: 69,
  total: 117,
  ideal: [
    { label: "Aug 10", value: 117 },
    { label: "Aug 12", value: 98 },
    { label: "Aug 14", value: 78 },
    { label: "Aug 16", value: 59 },
    { label: "Aug 18", value: 39 },
    { label: "Aug 20", value: 20 },
    { label: "Aug 22", value: 10 },
    { label: "Aug 24", value: 0 },
  ],
  actual: [
    { label: "Aug 10", value: 117 },
    { label: "Aug 12", value: 112 },
    { label: "Aug 14", value: 98 },
    { label: "Aug 16", value: 91 },
    { label: "Aug 18", value: 74 },
    { label: "Aug 20", value: 62 },
    { label: "Aug 22", value: 55 },
    { label: "Aug 24", value: 48 },
  ],
};

const SPRINT_37_HEATMAP: OverviewLeaf["heatmap"] = {
  rangeLabel: "Last 2 weeks",
  dayLabels: [
    "Aug 10",
    "Aug 11",
    "Aug 12",
    "Aug 13",
    "Aug 14",
    "Aug 15",
    "Aug 16",
    "Aug 17",
    "Aug 18",
    "Aug 19",
    "Aug 20",
    "Aug 21",
    "Aug 22",
    "Aug 23",
    "Aug 24",
  ],
  rows: [
    { label: "Commits", cells: [1, 0, 2, 3, 1, 0, 4, 2, 0, 1, 2, 3, 1, 0, 2] },
    { label: "PRs", cells: [0, 1, 2, 1, 3, 0, 2, 4, 1, 0, 2, 1, 3, 2, 1] },
    { label: "Jira updates", cells: [2, 3, 1, 2, 0, 1, 3, 2, 4, 1, 0, 2, 3, 1, 2] },
    { label: "Deployments", cells: [0, 0, 1, 0, 2, 0, 0, 1, 0, 3, 0, 1, 0, 2, 0] },
  ],
};

/** Sprint 36 — closed strong; confidence recovering into the period. */
const SPRINT_36_TREND: OverviewLeaf["deliveryTrend"] = {
  rangeLabel: "Last 6 weeks",
  target: 75,
  points: [
    { label: "Jun 29", value: 58 },
    { label: "Jul 2", value: 61 },
    { label: "Jul 6", value: 64 },
    { label: "Jul 9", value: 70 },
    { label: "Jul 13", value: 74 },
    { label: "Jul 16", value: 78 },
    { label: "Jul 20", value: 81 },
    { label: "Jul 23", value: 84 },
    { label: "Jul 27", value: 86 },
    { label: "Aug 9", value: 88 },
  ],
};

const SPRINT_36_BURNDOWN: OverviewLeaf["burndown"] = {
  completed: 94,
  total: 102,
  ideal: [
    { label: "Jul 27", value: 102 },
    { label: "Jul 29", value: 85 },
    { label: "Jul 31", value: 68 },
    { label: "Aug 2", value: 51 },
    { label: "Aug 4", value: 34 },
    { label: "Aug 6", value: 17 },
    { label: "Aug 9", value: 0 },
  ],
  actual: [
    { label: "Jul 27", value: 102 },
    { label: "Jul 29", value: 88 },
    { label: "Jul 31", value: 71 },
    { label: "Aug 2", value: 42 },
    { label: "Aug 4", value: 28 },
    { label: "Aug 6", value: 14 },
    { label: "Aug 9", value: 8 },
  ],
};

const SPRINT_36_HEATMAP: OverviewLeaf["heatmap"] = {
  rangeLabel: "Last 2 weeks",
  dayLabels: [
    "Jul 27",
    "Jul 28",
    "Jul 29",
    "Jul 30",
    "Jul 31",
    "Aug 1",
    "Aug 2",
    "Aug 3",
    "Aug 4",
    "Aug 5",
    "Aug 6",
    "Aug 7",
    "Aug 8",
    "Aug 9",
  ],
  rows: [
    { label: "Commits", cells: [3, 2, 3, 1, 0, 2, 3, 3, 2, 0, 1, 2, 3, 2] },
    { label: "PRs", cells: [2, 1, 3, 2, 0, 1, 2, 3, 1, 0, 2, 1, 2, 3] },
    { label: "Jira updates", cells: [3, 3, 2, 1, 0, 2, 3, 2, 3, 1, 2, 0, 1, 2] },
    { label: "Deployments", cells: [1, 0, 0, 2, 0, 0, 1, 0, 3, 0, 0, 1, 0, 2] },
  ],
};

/** Sprint 38 — early sprint, climbing confidence, ahead of ideal so far. */
const SPRINT_38_TREND: OverviewLeaf["deliveryTrend"] = {
  rangeLabel: "Last 6 weeks",
  target: 75,
  points: [
    { label: "Jul 27", value: 42 },
    { label: "Jul 30", value: 38 },
    { label: "Aug 3", value: 45 },
    { label: "Aug 6", value: 52 },
    { label: "Aug 10", value: 48 },
    { label: "Aug 13", value: 55 },
    { label: "Aug 17", value: 61 },
    { label: "Aug 20", value: 58 },
    { label: "Aug 24", value: 64 },
    { label: "Sep 7", value: 67 },
  ],
};

const SPRINT_38_BURNDOWN: OverviewLeaf["burndown"] = {
  completed: 38,
  total: 96,
  ideal: [
    { label: "Aug 25", value: 96 },
    { label: "Aug 27", value: 80 },
    { label: "Aug 29", value: 64 },
    { label: "Aug 31", value: 48 },
    { label: "Sep 2", value: 32 },
    { label: "Sep 4", value: 16 },
    { label: "Sep 7", value: 0 },
  ],
  actual: [
    { label: "Aug 25", value: 96 },
    { label: "Aug 27", value: 78 },
    { label: "Aug 29", value: 70 },
    { label: "Aug 31", value: 58 },
    { label: "Sep 2", value: 52 },
    { label: "Sep 4", value: 48 },
    { label: "Sep 7", value: 58 },
  ],
};

const SPRINT_38_HEATMAP: OverviewLeaf["heatmap"] = {
  rangeLabel: "Last 2 weeks",
  dayLabels: [
    "Aug 25",
    "Aug 26",
    "Aug 27",
    "Aug 28",
    "Aug 29",
    "Aug 30",
    "Aug 31",
    "Sep 1",
    "Sep 2",
    "Sep 3",
    "Sep 4",
    "Sep 5",
    "Sep 6",
    "Sep 7",
  ],
  rows: [
    { label: "Commits", cells: [2, 3, 1, 0, 3, 2, 1, 0, 2, 3, 1, 0, 2, 3] },
    { label: "PRs", cells: [1, 2, 0, 1, 2, 3, 0, 1, 3, 2, 0, 1, 2, 1] },
    { label: "Jira updates", cells: [3, 1, 2, 0, 2, 1, 3, 0, 1, 2, 3, 0, 2, 1] },
    { label: "Deployments", cells: [0, 1, 0, 0, 2, 0, 1, 0, 0, 3, 0, 0, 1, 0] },
  ],
};

/** Sprint 35 — closed cleanly; flat-high confidence, burndown to zero. */
const SPRINT_35_TREND: OverviewLeaf["deliveryTrend"] = {
  rangeLabel: "Last 6 weeks",
  target: 75,
  points: [
    { label: "Jun 15", value: 71 },
    { label: "Jun 18", value: 74 },
    { label: "Jun 22", value: 77 },
    { label: "Jun 25", value: 79 },
    { label: "Jun 29", value: 82 },
    { label: "Jul 2", value: 84 },
    { label: "Jul 6", value: 86 },
    { label: "Jul 9", value: 85 },
    { label: "Jul 13", value: 88 },
    { label: "Jul 26", value: 91 },
  ],
};

const SPRINT_35_BURNDOWN: OverviewLeaf["burndown"] = {
  completed: 71,
  total: 74,
  ideal: [
    { label: "Jul 13", value: 74 },
    { label: "Jul 15", value: 62 },
    { label: "Jul 17", value: 49 },
    { label: "Jul 19", value: 37 },
    { label: "Jul 21", value: 25 },
    { label: "Jul 23", value: 12 },
    { label: "Jul 26", value: 0 },
  ],
  actual: [
    { label: "Jul 13", value: 74 },
    { label: "Jul 15", value: 60 },
    { label: "Jul 17", value: 44 },
    { label: "Jul 19", value: 31 },
    { label: "Jul 21", value: 18 },
    { label: "Jul 23", value: 9 },
    { label: "Jul 26", value: 3 },
  ],
};

const SPRINT_35_HEATMAP: OverviewLeaf["heatmap"] = {
  rangeLabel: "Last 2 weeks",
  dayLabels: [
    "Jul 13",
    "Jul 14",
    "Jul 15",
    "Jul 16",
    "Jul 17",
    "Jul 18",
    "Jul 19",
    "Jul 20",
    "Jul 21",
    "Jul 22",
    "Jul 23",
    "Jul 24",
    "Jul 25",
    "Jul 26",
  ],
  rows: [
    { label: "Commits", cells: [2, 1, 3, 2, 0, 1, 3, 2, 1, 0, 2, 1, 0, 1] },
    { label: "PRs", cells: [1, 2, 1, 3, 0, 2, 1, 2, 3, 0, 1, 2, 0, 1] },
    { label: "Jira updates", cells: [3, 2, 1, 2, 0, 3, 2, 1, 2, 0, 1, 3, 1, 0] },
    { label: "Deployments", cells: [0, 0, 2, 0, 1, 0, 0, 3, 0, 0, 1, 0, 2, 0] },
  ],
};

const ORG_VARIANT: TeamVariant = {
  score: 48,
  band: "Caution",
  caption: "Sprint 37 is at risk of delay",
  completion: { value: "59%", progress: 59, annotation: "69 / 117" },
  blocked: 31,
  spillover: 16,
  aiRisk: "6%",
  aiRiskProgress: 6,
  takeaways: [
    {
      id: "blocked",
      title: "31 items blocked",
      subtitle: "+12 from last sprint",
      href: "/delivery-analysis?riskFocus=blockers",
      tone: "danger",
      glyph: "↗",
      needsAction: true,
    },
    {
      id: "at-risk",
      title: "16 items at risk",
      subtitle: "Likely to spill over",
      href: "/delivery-analysis?riskFocus=schedule",
      tone: "warning",
      glyph: "◷",
      needsAction: true,
    },
    {
      id: "ai",
      title: "AI code risk at 6%",
      subtitle: "No high-risk areas",
      href: "/code-analysis",
      tone: "success",
      glyph: "</>",
    },
    {
      id: "compliance",
      title: "4 compliance findings",
      subtitle: "2 resolved this week",
      href: "/governance",
      tone: "success",
      glyph: "♢",
    },
  ],
  pillars: [
    {
      id: "delivery",
      name: "Delivery",
      score: 59,
      delta: -12,
      footnote: "69 / 117 completed",
      progress: 59,
      tone: "warning",
      glyph: "⚑",
      href: PILLAR_HREFS.delivery,
    },
    {
      id: "code",
      name: "Code",
      score: 66,
      delta: 8,
      footnote: "30 blocked issues",
      progress: 66,
      tone: "steady",
      glyph: "</>",
      href: PILLAR_HREFS.code,
    },
    {
      id: "qa",
      name: "QA",
      score: 44,
      delta: -16,
      footnote: "223 open bugs",
      progress: 44,
      tone: "danger",
      glyph: "⚗",
      href: PILLAR_HREFS.qa,
    },
    {
      id: "compliance",
      name: "Compliance",
      score: 65,
      delta: 5,
      footnote: "4 open findings",
      progress: 65,
      tone: "steady",
      glyph: "♢",
      href: PILLAR_HREFS.compliance,
    },
  ],
  attentionMessage:
    "30 blocked issues are in the evidence set — ask engineering for an owner and ETA.",
};

const TEAM_VARIANTS: Record<string, TeamVariant> = {
  WEB: {
    score: 52,
    band: "Caution",
    caption: "Connexus Web is behind on Sprint 37",
    completion: { value: "64%", progress: 64, annotation: "41 / 64" },
    blocked: 14,
    spillover: 9,
    aiRisk: "8%",
    aiRiskProgress: 8,
    takeaways: [
      {
        id: "blocked",
        title: "14 items blocked",
        subtitle: "+4 from last sprint",
        href: "/delivery-analysis?riskFocus=blockers",
        tone: "danger",
        glyph: "↗",
        needsAction: true,
      },
      {
        id: "at-risk",
        title: "9 items at risk",
        subtitle: "Likely to spill over",
        href: "/delivery-analysis?riskFocus=schedule",
        tone: "warning",
        glyph: "◷",
        needsAction: true,
      },
      {
        id: "ai",
        title: "AI code risk at 8%",
        subtitle: "Web client hotspots",
        href: "/code-analysis",
        tone: "success",
        glyph: "</>",
      },
      {
        id: "compliance",
        title: "2 compliance findings",
        subtitle: "1 resolved this week",
        href: "/governance",
        tone: "success",
        glyph: "♢",
      },
    ],
    pillars: [
      {
        id: "delivery",
        name: "Delivery",
        score: 64,
        delta: -8,
        footnote: "41 / 64 completed",
        progress: 64,
        tone: "warning",
        glyph: "⚑",
        href: PILLAR_HREFS.delivery,
      },
      {
        id: "code",
        name: "Code",
        score: 70,
        delta: 6,
        footnote: "12 blocked issues",
        progress: 70,
        tone: "steady",
        glyph: "</>",
        href: PILLAR_HREFS.code,
      },
      {
        id: "qa",
        name: "QA",
        score: 51,
        delta: -9,
        footnote: "88 open bugs",
        progress: 51,
        tone: "warning",
        glyph: "⚗",
        href: PILLAR_HREFS.qa,
      },
      {
        id: "compliance",
        name: "Compliance",
        score: 72,
        delta: 3,
        footnote: "2 open findings",
        progress: 72,
        tone: "steady",
        glyph: "♢",
        href: PILLAR_HREFS.compliance,
      },
    ],
    attentionMessage:
      "14 blocked Web issues need an owner and ETA before the sprint ends.",
  },
  MOB: {
    score: 41,
    band: "At risk",
    caption: "Mobile App is at high risk of delay",
    completion: { value: "48%", progress: 48, annotation: "18 / 38" },
    blocked: 11,
    spillover: 7,
    aiRisk: "4%",
    aiRiskProgress: 4,
    takeaways: [
      {
        id: "blocked",
        title: "11 items blocked",
        subtitle: "+6 from last sprint",
        href: "/delivery-analysis?riskFocus=blockers",
        tone: "danger",
        glyph: "↗",
        needsAction: true,
      },
      {
        id: "at-risk",
        title: "7 items at risk",
        subtitle: "Likely to spill over",
        href: "/delivery-analysis?riskFocus=schedule",
        tone: "warning",
        glyph: "◷",
        needsAction: true,
      },
      {
        id: "ai",
        title: "AI code risk at 4%",
        subtitle: "No high-risk areas",
        href: "/code-analysis",
        tone: "success",
        glyph: "</>",
      },
      {
        id: "compliance",
        title: "1 compliance finding",
        subtitle: "Opened this sprint",
        href: "/governance",
        tone: "warning",
        glyph: "♢",
        needsAction: true,
      },
    ],
    pillars: [
      {
        id: "delivery",
        name: "Delivery",
        score: 48,
        delta: -18,
        footnote: "18 / 38 completed",
        progress: 48,
        tone: "danger",
        glyph: "⚑",
        href: PILLAR_HREFS.delivery,
      },
      {
        id: "code",
        name: "Code",
        score: 58,
        delta: -2,
        footnote: "9 blocked issues",
        progress: 58,
        tone: "warning",
        glyph: "</>",
        href: PILLAR_HREFS.code,
      },
      {
        id: "qa",
        name: "QA",
        score: 36,
        delta: -22,
        footnote: "61 open bugs",
        progress: 36,
        tone: "danger",
        glyph: "⚗",
        href: PILLAR_HREFS.qa,
      },
      {
        id: "compliance",
        name: "Compliance",
        score: 61,
        delta: 1,
        footnote: "1 open finding",
        progress: 61,
        tone: "steady",
        glyph: "♢",
        href: PILLAR_HREFS.compliance,
      },
    ],
    attentionMessage:
      "Mobile App has 11 blocked issues and 7 spillover candidates — review owners now.",
  },
  DATA: {
    score: 61,
    band: "Steady",
    caption: "Data Platform is tracking near plan",
    completion: { value: "72%", progress: 72, annotation: "26 / 36" },
    blocked: 4,
    spillover: 3,
    aiRisk: "5%",
    aiRiskProgress: 5,
    takeaways: [
      {
        id: "blocked",
        title: "4 items blocked",
        subtitle: "Flat vs last sprint",
        href: "/delivery-analysis?riskFocus=blockers",
        tone: "warning",
        glyph: "↗",
        needsAction: true,
      },
      {
        id: "at-risk",
        title: "3 items at risk",
        subtitle: "Likely to spill over",
        href: "/delivery-analysis?riskFocus=schedule",
        tone: "warning",
        glyph: "◷",
      },
      {
        id: "ai",
        title: "AI code risk at 5%",
        subtitle: "No high-risk areas",
        href: "/code-analysis",
        tone: "success",
        glyph: "</>",
      },
      {
        id: "compliance",
        title: "1 compliance finding",
        subtitle: "In review",
        href: "/governance",
        tone: "success",
        glyph: "♢",
      },
    ],
    pillars: [
      {
        id: "delivery",
        name: "Delivery",
        score: 72,
        delta: 4,
        footnote: "26 / 36 completed",
        progress: 72,
        tone: "steady",
        glyph: "⚑",
        href: PILLAR_HREFS.delivery,
      },
      {
        id: "code",
        name: "Code",
        score: 74,
        delta: 5,
        footnote: "3 blocked issues",
        progress: 74,
        tone: "steady",
        glyph: "</>",
        href: PILLAR_HREFS.code,
      },
      {
        id: "qa",
        name: "QA",
        score: 58,
        delta: -3,
        footnote: "29 open bugs",
        progress: 58,
        tone: "warning",
        glyph: "⚗",
        href: PILLAR_HREFS.qa,
      },
      {
        id: "compliance",
        name: "Compliance",
        score: 80,
        delta: 2,
        footnote: "1 open finding",
        progress: 80,
        tone: "steady",
        glyph: "♢",
        href: PILLAR_HREFS.compliance,
      },
    ],
    attentionMessage:
      "4 blocked Data Platform issues still need an owner before close.",
  },
  INFRA: {
    score: 68,
    band: "Steady",
    caption: "Infrastructure is on track for Sprint 37",
    completion: { value: "81%", progress: 81, annotation: "17 / 21" },
    blocked: 2,
    spillover: 1,
    aiRisk: "3%",
    aiRiskProgress: 3,
    takeaways: [
      {
        id: "blocked",
        title: "2 items blocked",
        subtitle: "Down from last sprint",
        href: "/delivery-analysis?riskFocus=blockers",
        tone: "warning",
        glyph: "↗",
      },
      {
        id: "at-risk",
        title: "1 item at risk",
        subtitle: "Likely to spill over",
        href: "/delivery-analysis?riskFocus=schedule",
        tone: "info",
        glyph: "◷",
      },
      {
        id: "ai",
        title: "AI code risk at 3%",
        subtitle: "No high-risk areas",
        href: "/code-analysis",
        tone: "success",
        glyph: "</>",
      },
      {
        id: "compliance",
        title: "0 compliance findings",
        subtitle: "Clear this week",
        href: "/governance",
        tone: "success",
        glyph: "♢",
      },
    ],
    pillars: [
      {
        id: "delivery",
        name: "Delivery",
        score: 81,
        delta: 6,
        footnote: "17 / 21 completed",
        progress: 81,
        tone: "steady",
        glyph: "⚑",
        href: PILLAR_HREFS.delivery,
      },
      {
        id: "code",
        name: "Code",
        score: 79,
        delta: 4,
        footnote: "2 blocked issues",
        progress: 79,
        tone: "steady",
        glyph: "</>",
        href: PILLAR_HREFS.code,
      },
      {
        id: "qa",
        name: "QA",
        score: 66,
        delta: 2,
        footnote: "12 open bugs",
        progress: 66,
        tone: "steady",
        glyph: "⚗",
        href: PILLAR_HREFS.qa,
      },
      {
        id: "compliance",
        name: "Compliance",
        score: 88,
        delta: 0,
        footnote: "0 open findings",
        progress: 88,
        tone: "steady",
        glyph: "♢",
        href: PILLAR_HREFS.compliance,
      },
    ],
    attentionMessage:
      "2 blocked Infrastructure issues remain — confirm owners before sign-off.",
  },
};

function teamPatch(variant: TeamVariant): DeepPartial<OverviewLeaf> {
  const leaf = leafFromVariant(variant);
  return {
    deliveryConfidence: leaf.deliveryConfidence,
    keyTakeaways: leaf.keyTakeaways,
    pillars: leaf.pillars,
    attention: leaf.attention,
  };
}

/** Org-level KPI story for a prior/next sprint (charts supplied separately). */
function sprintOrgPatch(
  variant: TeamVariant,
  charts: {
    deliveryTrend: OverviewLeaf["deliveryTrend"];
    burndown: OverviewLeaf["burndown"];
    heatmap: OverviewLeaf["heatmap"];
  },
): DeepPartial<OverviewLeaf> {
  const leaf = leafFromVariant(variant);
  return {
    deliveryConfidence: leaf.deliveryConfidence,
    keyTakeaways: leaf.keyTakeaways,
    pillars: leaf.pillars,
    attention: leaf.attention,
    leadership: leaf.leadership,
    deliveryTrend: charts.deliveryTrend,
    burndown: charts.burndown,
    heatmap: charts.heatmap,
  };
}

const SPRINT_36_VARIANT: TeamVariant = {
  score: 78,
  band: "Steady",
  caption: "Sprint 36 closed near plan",
  completion: { value: "92%", progress: 92, annotation: "94 / 102" },
  blocked: 5,
  spillover: 2,
  aiRisk: "4%",
  aiRiskProgress: 4,
  takeaways: [
    {
      id: "blocked",
      title: "5 items blocked",
      subtitle: "Down from prior sprint",
      href: "/delivery-analysis?riskFocus=blockers",
      tone: "warning",
      glyph: "↗",
    },
    {
      id: "at-risk",
      title: "2 items at risk",
      subtitle: "Carried into Sprint 37",
      href: "/delivery-analysis?riskFocus=schedule",
      tone: "info",
      glyph: "◷",
    },
    {
      id: "ai",
      title: "AI code risk at 4%",
      subtitle: "No high-risk areas",
      href: "/code-analysis",
      tone: "success",
      glyph: "</>",
    },
    {
      id: "compliance",
      title: "1 compliance finding",
      subtitle: "Resolved before close",
      href: "/governance",
      tone: "success",
      glyph: "♢",
    },
  ],
  pillars: [
    {
      id: "delivery",
      name: "Delivery",
      score: 88,
      delta: 6,
      footnote: "94 / 102 completed",
      progress: 88,
      tone: "steady",
      glyph: "⚑",
      href: PILLAR_HREFS.delivery,
    },
    {
      id: "code",
      name: "Code",
      score: 74,
      delta: 4,
      footnote: "5 blocked issues",
      progress: 74,
      tone: "steady",
      glyph: "</>",
      href: PILLAR_HREFS.code,
    },
    {
      id: "qa",
      name: "QA",
      score: 71,
      delta: 8,
      footnote: "48 open bugs",
      progress: 71,
      tone: "steady",
      glyph: "⚗",
      href: PILLAR_HREFS.qa,
    },
    {
      id: "compliance",
      name: "Compliance",
      score: 82,
      delta: 3,
      footnote: "0 open findings",
      progress: 82,
      tone: "steady",
      glyph: "♢",
      href: PILLAR_HREFS.compliance,
    },
  ],
  attentionMessage:
    "Sprint 36 closed with 2 carry-over items — confirm they landed in Sprint 37.",
};

const SPRINT_38_VARIANT: TeamVariant = {
  score: 64,
  band: "Steady",
  caption: "Sprint 38 is tracking early scope",
  completion: { value: "40%", progress: 40, annotation: "38 / 96" },
  blocked: 8,
  spillover: 4,
  aiRisk: "5%",
  aiRiskProgress: 5,
  takeaways: [
    {
      id: "blocked",
      title: "8 items blocked",
      subtitle: "Early-sprint dependency wait",
      href: "/delivery-analysis?riskFocus=blockers",
      tone: "warning",
      glyph: "↗",
      needsAction: true,
    },
    {
      id: "at-risk",
      title: "4 items at risk",
      subtitle: "Watch mid-sprint scope",
      href: "/delivery-analysis?riskFocus=schedule",
      tone: "warning",
      glyph: "◷",
    },
    {
      id: "ai",
      title: "AI code risk at 5%",
      subtitle: "No high-risk areas",
      href: "/code-analysis",
      tone: "success",
      glyph: "</>",
    },
    {
      id: "compliance",
      title: "2 compliance findings",
      subtitle: "Opened this sprint",
      href: "/governance",
      tone: "warning",
      glyph: "♢",
      needsAction: true,
    },
  ],
  pillars: [
    {
      id: "delivery",
      name: "Delivery",
      score: 62,
      delta: 4,
      footnote: "38 / 96 completed",
      progress: 62,
      tone: "steady",
      glyph: "⚑",
      href: PILLAR_HREFS.delivery,
    },
    {
      id: "code",
      name: "Code",
      score: 70,
      delta: 2,
      footnote: "8 blocked issues",
      progress: 70,
      tone: "steady",
      glyph: "</>",
      href: PILLAR_HREFS.code,
    },
    {
      id: "qa",
      name: "QA",
      score: 58,
      delta: 6,
      footnote: "96 open bugs",
      progress: 58,
      tone: "warning",
      glyph: "⚗",
      href: PILLAR_HREFS.qa,
    },
    {
      id: "compliance",
      name: "Compliance",
      score: 68,
      delta: -2,
      footnote: "2 open findings",
      progress: 68,
      tone: "warning",
      glyph: "♢",
      href: PILLAR_HREFS.compliance,
    },
  ],
  attentionMessage:
    "8 early-sprint blockers need owners before mid-sprint check-in.",
};

const SPRINT_35_VARIANT: TeamVariant = {
  score: 84,
  band: "Steady",
  caption: "Sprint 35 closed cleanly",
  completion: { value: "96%", progress: 96, annotation: "71 / 74" },
  blocked: 1,
  spillover: 0,
  aiRisk: "3%",
  aiRiskProgress: 3,
  takeaways: [
    {
      id: "blocked",
      title: "1 item blocked",
      subtitle: "Resolved at close",
      href: "/delivery-analysis?riskFocus=blockers",
      tone: "success",
      glyph: "↗",
    },
    {
      id: "at-risk",
      title: "0 items at risk",
      subtitle: "No spillover",
      href: "/delivery-analysis?riskFocus=schedule",
      tone: "success",
      glyph: "◷",
    },
    {
      id: "ai",
      title: "AI code risk at 3%",
      subtitle: "No high-risk areas",
      href: "/code-analysis",
      tone: "success",
      glyph: "</>",
    },
    {
      id: "compliance",
      title: "0 compliance findings",
      subtitle: "Clear at close",
      href: "/governance",
      tone: "success",
      glyph: "♢",
    },
  ],
  pillars: [
    {
      id: "delivery",
      name: "Delivery",
      score: 94,
      delta: 10,
      footnote: "71 / 74 completed",
      progress: 94,
      tone: "steady",
      glyph: "⚑",
      href: PILLAR_HREFS.delivery,
    },
    {
      id: "code",
      name: "Code",
      score: 81,
      delta: 5,
      footnote: "1 blocked issue",
      progress: 81,
      tone: "steady",
      glyph: "</>",
      href: PILLAR_HREFS.code,
    },
    {
      id: "qa",
      name: "QA",
      score: 76,
      delta: 9,
      footnote: "22 open bugs",
      progress: 76,
      tone: "steady",
      glyph: "⚗",
      href: PILLAR_HREFS.qa,
    },
    {
      id: "compliance",
      name: "Compliance",
      score: 90,
      delta: 4,
      footnote: "0 open findings",
      progress: 90,
      tone: "steady",
      glyph: "♢",
      href: PILLAR_HREFS.compliance,
    },
  ],
  attentionMessage:
    "Sprint 35 closed with no spillover — keep the same ownership pattern.",
};

export function buildMockOverview(): Dimensioned<OverviewLeaf> {
  const byTeam: Dimensioned<OverviewLeaf>["byTeam"] = {};
  for (const [key, variant] of Object.entries(TEAM_VARIANTS)) {
    byTeam[key] = teamPatch(variant);
  }
  return {
    base: leafFromVariant(ORG_VARIANT),
    byTeam,
    bySprint: {
      "35": sprintOrgPatch(SPRINT_35_VARIANT, {
        deliveryTrend: SPRINT_35_TREND,
        burndown: SPRINT_35_BURNDOWN,
        heatmap: SPRINT_35_HEATMAP,
      }),
      "36": sprintOrgPatch(SPRINT_36_VARIANT, {
        deliveryTrend: SPRINT_36_TREND,
        burndown: SPRINT_36_BURNDOWN,
        heatmap: SPRINT_36_HEATMAP,
      }),
      "38": sprintOrgPatch(SPRINT_38_VARIANT, {
        deliveryTrend: SPRINT_38_TREND,
        burndown: SPRINT_38_BURNDOWN,
        heatmap: SPRINT_38_HEATMAP,
      }),
    },
  };
}

/** @deprecated Prefer buildMockOverview; kept for gradual migration. */
export const mockOverviewDimensioned = buildMockOverview();
