import type { OverviewDashboardModel, OverviewSprintOption } from "@/lib/overview/types";
import { METRIC_HREFS, PILLAR_HREFS } from "@/lib/overview/nav-context";

/**
 * Demo stage: Connexus Overview fixture is on by default in all environments
 * (including production / Docker). Opt out with `?fixture=0` or
 * `DRYDOCK_OVERVIEW_FIXTURE=0`.
 */
export function shouldUseOverviewFixture(
  fixtureParam?: string | null,
): boolean {
  const flag = fixtureParam?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;

  const env = process.env.DRYDOCK_OVERVIEW_FIXTURE?.trim().toLowerCase();
  if (env === "0" || env === "false" || env === "off") return false;
  if (env === "1" || env === "true" || env === "on") return true;

  return true;
}

/** Fixed ISO so SSR and client agree (avoids relative-time hydration churn). */
export const OVERVIEW_FIXTURE_LAST_SYNC_AT = "2026-08-24T10:49:00.000Z";

const SPRINTS: OverviewSprintOption[] = [
  {
    id: "37",
    name: "Sprint 37",
    startLabel: "Aug 10",
    endLabel: "Aug 24",
    rangeLabel: "Aug 10 – Aug 24, 2026",
    start: "2026-08-10",
    end: "2026-08-24",
  },
  {
    id: "36",
    name: "Sprint 36",
    startLabel: "Jul 27",
    endLabel: "Aug 9",
    rangeLabel: "Jul 27 – Aug 9, 2026",
    start: "2026-07-27",
    end: "2026-08-09",
  },
  {
    id: "38",
    name: "Sprint 38",
    startLabel: "Aug 25",
    endLabel: "Sep 7",
    rangeLabel: "Aug 25 – Sep 7, 2026",
    start: "2026-08-25",
    end: "2026-09-07",
  },
];

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

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Pixel-target fixture matching Connexus Overview (+ team/sprint variance). */
export function getOverviewFixture(
  overrides?: Partial<
    Pick<OverviewDashboardModel, "greetingName" | "teamKey">
  > & { sprintId?: string | null; greetingHour?: number },
): OverviewDashboardModel {
  const teamKey = overrides?.teamKey ?? null;
  const variant =
    (teamKey && TEAM_VARIANTS[teamKey]) || ORG_VARIANT;

  const sprintId = overrides?.sprintId ?? "37";
  const sprint =
    SPRINTS.find((s) => s.id === sprintId) ?? SPRINTS.find((s) => s.id === "37")!;

  const hour = overrides?.greetingHour ?? new Date().getHours();

  return {
    greetingName: overrides?.greetingName ?? "Krishna",
    greeting: greetingForHour(hour),
    sprint: {
      id: sprint.id,
      name: sprint.name,
      startLabel: sprint.startLabel,
      endLabel: sprint.endLabel,
      rangeLabel: sprint.rangeLabel,
    },
    sprints: SPRINTS,
    teamKey,
    teams: [
      { key: "WEB", name: "Connexus Web" },
      { key: "MOB", name: "Mobile App" },
      { key: "DATA", name: "Data Platform" },
      { key: "INFRA", name: "Infrastructure" },
    ],
    deliveryConfidence: {
      score: variant.score,
      band: variant.band,
      caption:
        sprint.id === "37"
          ? variant.caption
          : variant.caption.replace(/Sprint 37/g, sprint.name),
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
    deliveryTrend: {
      rangeLabel: "Last 6 weeks",
      target: 80,
      points: [
        { label: "Jul 13", value: 94 },
        { label: "Jul 16", value: 76 },
        { label: "Jul 20", value: 68 },
        { label: "Jul 23", value: 59 },
        { label: "Jul 27", value: 45 },
        { label: "Jul 30", value: 37 },
        { label: "Aug 3", value: 17 },
        { label: "Aug 10", value: 18 },
        { label: "Aug 17", value: 8 },
        { label: "Aug 24", value: 22 },
      ],
    },
    burndown: {
      completed: 69,
      total: 117,
      ideal: [
        { label: "Aug 10", value: 120 },
        { label: "Aug 13", value: 96 },
        { label: "Aug 16", value: 72 },
        { label: "Aug 19", value: 48 },
        { label: "Aug 22", value: 24 },
        { label: "Aug 24", value: 0 },
      ],
      actual: [
        { label: "Aug 10", value: 120 },
        { label: "Aug 13", value: 105 },
        { label: "Aug 16", value: 92 },
        { label: "Aug 19", value: 70 },
        { label: "Aug 22", value: 47 },
        { label: "Aug 24", value: 28 },
      ],
    },
    heatmap: {
      rangeLabel: "Last 2 weeks",
      dayLabels: ["Aug 10", "Aug 13", "Aug 16", "Aug 19", "Aug 22", "Aug 24"],
      rows: [
        {
          label: "Commits",
          cells: [0, 0, 0, 2, 0, 3, 0, 2, 0, 1, 2, 0, 3, 0, 1, 0],
        },
        {
          label: "PRs",
          cells: [1, 2, 3, 2, 0, 1, 3, 0, 2, 1, 0, 3, 2, 0, 1, 2],
        },
        {
          label: "Jira updates",
          cells: [2, 1, 0, 3, 2, 1, 0, 2, 3, 0, 1, 0, 2, 3, 0, 2],
        },
        {
          label: "Deployments",
          cells: [0, 1, 2, 0, 3, 2, 0, 1, 2, 0, 3, 1, 0, 2, 0, 3],
        },
      ],
    },
    attention: {
      count: 2,
      message: variant.attentionMessage,
      href: "/attention",
    },
    leadership: {
      count: 1,
      href: "/approvals",
    },
    lastSyncAt: OVERVIEW_FIXTURE_LAST_SYNC_AT,
    empty: false,
  };
}
