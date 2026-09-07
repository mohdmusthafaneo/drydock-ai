export type EvidenceMeta = { source: string; asOf: string };

export type ConfidenceBand = "Strong" | "Steady" | "Caution" | "At risk";

export type OverviewSprintOption = {
  id: string;
  name: string;
  startLabel: string;
  endLabel: string;
  rangeLabel: string;
  /** ISO date for top-bar DateRangeButton (`YYYY-MM-DD`). */
  start: string;
  end: string;
};

export type OverviewDashboardModel = {
  greetingName: string;
  /** Server-computed greeting phrase to avoid SSR/client hour mismatch. */
  greeting: string;
  sprint: {
    id: string;
    name: string;
    startLabel: string;
    endLabel: string;
    rangeLabel: string;
  };
  /** Sprint picker options for the header chip. */
  sprints: OverviewSprintOption[];
  teamKey: string | null;
  teams: { key: string; name: string }[];
  deliveryConfidence: {
    score: number;
    band: ConfidenceBand;
    caption: string;
    href: string;
    metrics: Array<{
      id: string;
      label: string;
      value: number | string;
      progress: number;
      annotation?: string;
      icon: string;
      href?: string;
    }>;
  };
  keyTakeaways: Array<{
    id: string;
    title: string;
    subtitle: string;
    href: string;
    tone: "danger" | "warning" | "info" | "success";
    /** Designer glyph when present (e.g. ↗, ◷, </>, ♢). */
    glyph?: string;
    needsAction?: boolean;
  }>;
  pillars: Array<{
    id: string;
    name: string;
    score: number;
    delta: number | null;
    footnote: string;
    progress: number;
    tone: string;
    /** Designer glyph when present (e.g. ⚑, </>, ⚗, ♢). */
    glyph?: string;
    href?: string;
  }>;
  deliveryTrend: {
    points: { label: string; value: number }[];
    target: number;
    rangeLabel: string;
  };
  burndown: {
    ideal: { label: string; value: number }[];
    actual: { label: string; value: number }[];
    completed: number;
    total: number;
  };
  heatmap: {
    rows: { label: string; cells: number[] }[];
    dayLabels: string[];
    rangeLabel: string;
  };
  attention: { count: number; message: string; href: string } | null;
  leadership: { count: number; href: string };
  lastSyncAt: string | null;
  empty: boolean;
};

export type OverviewPillar = OverviewDashboardModel["pillars"][number];
export type OverviewTakeaway = OverviewDashboardModel["keyTakeaways"][number];

/** Persisted in OverviewSnapshot.payloadJson for WoW deltas. */
export type OverviewSnapshotPayload = {
  pillars: { id: string; score: number }[];
  kpis: {
    completionPct: number | null;
    blocked: number;
    atRisk: number;
    aiRiskPct: number;
    openFindings: number;
    openBugs: number;
  };
};
