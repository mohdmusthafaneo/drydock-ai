/** Shapes used by the DryDock AI page from the Cursor mock Admin API. */

export type CursorDauPoint = {
  date: string;
  dau: number;
  cli_dau: number;
  cloud_agent_dau: number;
  bugbot_dau: number;
};

export type CursorAgentEditPoint = {
  event_date: string;
  total_suggested_diffs: number;
  total_accepted_diffs: number;
  total_rejected_diffs: number;
  total_lines_suggested: number;
  total_lines_accepted: number;
};

export type CursorTabsPoint = {
  event_date: string;
  total_suggestions: number;
  total_accepts: number;
  total_rejects: number;
  total_lines_suggested: number;
  total_lines_accepted: number;
};

export type CursorModelDay = {
  date: string;
  model_breakdown: Record<string, { messages: number; users: number }>;
};

export type CursorFileExtensionPoint = {
  event_date: string;
  file_extension: string;
  total_files: number;
  total_accepts: number;
  total_rejects: number;
  total_lines_suggested: number;
  total_lines_accepted: number;
};

export type CursorAiCommit = {
  commitHash: string;
  repoName: string;
  branchName: string;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  tabLinesAdded: number;
  composerLinesAdded: number;
  nonAiLinesAdded: number;
  message: string;
  commitTs: string;
};

export type CursorAiKpis = {
  latestDau: number | null;
  latestDauDate: string | null;
  agentAcceptRatePct: number | null;
  agentAccepted: number;
  agentSuggested: number;
  tabAcceptRatePct: number | null;
  tabAccepts: number;
  tabSuggestions: number;
  aiCommitsTracked: number | null;
};

export type CursorModelTotal = {
  model: string;
  messages: number;
};

export type CursorExtensionTotal = {
  extension: string;
  linesAccepted: number;
  accepts: number;
};

export type CursorAiTool = {
  id: string;
  name: string;
  category: "editor" | "agent" | "review" | "cloud";
  /** Active days or sessions in the sprint window. */
  activeUnits: number;
  tokens: number;
  spendUsd: number;
  sharePct: number;
  hint: string;
};

export type CursorTokenSpend = {
  totalTokens: number;
  totalSpendUsd: number;
  inputTokens: number;
  outputTokens: number;
  byModel: Array<{ model: string; tokens: number; spendUsd: number; sharePct: number }>;
  coveragePct: number;
  /** Tickets (Jira keys) that received any AI tokens / tickets touched in sprint. */
  ticketsCovered: number;
  ticketsTouched: number;
};

export type CursorAiRoi = {
  engHoursSaved: number;
  engCostSavedUsd: number;
  tokenSpendUsd: number;
  netValueUsd: number;
  roiMultiple: number | null;
  aiLinesAccepted: number;
  blendedHourlyUsd: number;
  caption: string;
};

export type CursorTicketTokenUsage = {
  jiraKey: string;
  summary: string;
  repoName: string;
  prCount: number;
  aiLines: number;
  tokens: number;
  spendUsd: number;
  attribution: "ai_generated" | "ai_assisted" | "human_only" | "mixed";
};

/** Person-dimension token rows — render only on `/productivity`. */
export type CursorContributorTokenUsage = {
  contributorId: string;
  displayName: string;
  avatarInitials: string;
  teamKey: string;
  tokens: number;
  spendUsd: number;
  ticketKeys: string[];
  prCount: number;
  aiLines: number;
  aiSharePct: number;
};

export type CursorAiSnapshot = {
  /** `appdata-mock` is built from the AppData productivity/overview fixtures. */
  source: "appdata-mock" | "cursor-mock";
  fetchedAt: string;
  kpis: CursorAiKpis;
  dau: CursorDauPoint[];
  agentEdits: CursorAgentEditPoint[];
  tabs: CursorTabsPoint[];
  models: CursorModelTotal[];
  extensions: CursorExtensionTotal[];
  commits: CursorAiCommit[];
  tools: CursorAiTool[];
  tokenSpend: CursorTokenSpend;
  roi: CursorAiRoi;
  tickets: CursorTicketTokenUsage[];
  /** For Productivity only — never render on `/ai`. */
  contributors: CursorContributorTokenUsage[];
  warnings: string[];
};
