export type EvidenceMeta = { source: string; asOf: string };

export type ConfidenceBand = "Strong" | "Steady" | "Caution" | "At risk";

/** Visual tone for a highlighted score-derivation segment. */
export type ScoreDerivationTone = "score" | "steady" | "down" | "up";

/** Inline segment for a conversational score-derivation line. */
export type ScoreDerivationSegment =
  | { kind: "text"; text: string }
  | { kind: "emphasis"; text: string; tone?: ScoreDerivationTone };

/** Plain-English explanation of how the delivery-confidence gauge score is derived. */
export type ScoreDerivation = {
  /** Conversational paragraphs; each is an inline segment list. */
  paragraphs: ScoreDerivationSegment[][];
  /** Flat string for aria / screen readers. */
  plainText: string;
};

export type OverviewSprintOption = {
  id: string;
  name: string;
  startLabel: string;
  endLabel: string;
  rangeLabel: string;
  /** ISO start/end (`YYYY-MM-DD` or full datetime) for top-bar sprint chip. */
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
  /** Sprint options (top-bar picker + dashboard model). */
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
    derivation: ScoreDerivation;
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
