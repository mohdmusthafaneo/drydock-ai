/**
 * Build a Cursor-shaped AI dashboard snapshot from AppData productivity +
 * dimension fixtures so the AI tab shares the same repos, Jira keys, sprint
 * window, and PR activity as Overview / Productivity.
 */
import type {
  CursorAiCommit,
  CursorAiRoi,
  CursorAiSnapshot,
  CursorAiTool,
  CursorAgentEditPoint,
  CursorContributorTokenUsage,
  CursorDauPoint,
  CursorExtensionTotal,
  CursorModelTotal,
  CursorTabsPoint,
  CursorTicketTokenUsage,
  CursorTokenSpend,
} from "@/lib/cursor-api/types";
import type {
  AiAttribution,
  ProductivityPullRequest,
  ProductivitySnapshot,
} from "@/lib/productivity/types";
import type { AppDimensions, AppRepo } from "@/lib/store/types";

/** Mock blended USD per 1M tokens by model family (incl. platform markup). */
const MODEL_COST_PER_MTOK: Record<string, number> = {
  "claude-sonnet-4.5": 18,
  "composer-1": 14,
  "gpt-4o": 16,
  "claude-opus-4.5": 40,
};

const BLENDED_HOURLY_USD = 85;
const LINES_PER_ENG_HOUR = 42;
/** Cursor Business seat, pro-rated for a 2-week sprint. */
const SEAT_COST_PER_SPRINT_USD = 20;

function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 100);
}

/** Deterministic faux SHA from PR id — stable across renders, not a real git hash. */
function fauxCommitHash(prId: string, number: number): string {
  let h = 2166136261;
  const input = `${prId}:${number}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function eachDateInclusive(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return dates;
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function splitLines(
  additions: number,
  attribution: AiAttribution,
): { tab: number; composer: number; nonAi: number } {
  if (additions <= 0) return { tab: 0, composer: 0, nonAi: 0 };
  let composerShare = 0.05;
  let tabShare = 0.05;
  if (attribution === "ai_generated") {
    composerShare = 0.72;
    tabShare = 0.18;
  } else if (attribution === "ai_assisted") {
    composerShare = 0.48;
    tabShare = 0.22;
  }
  const composer = Math.round(additions * composerShare);
  const tab = Math.round(additions * tabShare);
  const nonAi = Math.max(0, additions - composer - tab);
  return { tab, composer, nonAi };
}

function repoFullName(pr: ProductivityPullRequest, repos: AppRepo[]): string {
  const match = repos.find((r) => r.id === pr.repo || r.name === pr.repo);
  if (match?.fullName) return match.fullName;
  if (pr.repo.includes("/")) return pr.repo;
  return `neoito/${pr.repo}`;
}

function commitMessage(pr: ProductivityPullRequest): string {
  const keys = pr.jiraKeys.length > 0 ? `${pr.jiraKeys.join(", ")}: ` : "";
  return `${keys}${pr.title}`;
}

function extensionMixForRepo(repo: string): Array<{ extension: string; weight: number }> {
  if (repo.includes("mobile")) {
    return [
      { extension: "tsx", weight: 0.38 },
      { extension: "ts", weight: 0.32 },
      { extension: "kt", weight: 0.18 },
      { extension: "swift", weight: 0.12 },
    ];
  }
  return [
    { extension: "tsx", weight: 0.42 },
    { extension: "ts", weight: 0.4 },
    { extension: "css", weight: 0.1 },
    { extension: "json", weight: 0.08 },
  ];
}

function buildCommits(
  prs: ProductivityPullRequest[],
  repos: AppRepo[],
  sprintId: string,
): CursorAiCommit[] {
  return [...prs]
    .filter((pr) => pr.mergedAt)
    .sort((a, b) => (a.mergedAt! < b.mergedAt! ? 1 : -1))
    .map((pr) => {
      const split = splitLines(pr.additions, pr.attribution);
      return {
        commitHash: fauxCommitHash(pr.id, pr.number),
        repoName: repoFullName(pr, repos),
        branchName: `sprint/${sprintId}`,
        totalLinesAdded: pr.additions,
        totalLinesDeleted: pr.deletions,
        tabLinesAdded: split.tab,
        composerLinesAdded: split.composer,
        nonAiLinesAdded: split.nonAi,
        message: commitMessage(pr),
        commitTs: pr.mergedAt!,
      };
    });
}

function buildDailySeries(
  dates: string[],
  prs: ProductivityPullRequest[],
  teamSize: number,
): {
  dau: CursorDauPoint[];
  agentEdits: CursorAgentEditPoint[];
  tabs: CursorTabsPoint[];
} {
  const byDay = new Map<string, ProductivityPullRequest[]>();
  for (const pr of prs) {
    if (!pr.mergedAt) continue;
    const key = dayKey(pr.mergedAt);
    const list = byDay.get(key) ?? [];
    list.push(pr);
    byDay.set(key, list);
  }

  const dau: CursorDauPoint[] = [];
  const agentEdits: CursorAgentEditPoint[] = [];
  const tabs: CursorTabsPoint[] = [];

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!;
    const dayPrs = byDay.get(date) ?? [];
    const aiPrs = dayPrs.filter((p) => p.attribution !== "human_only");
    const humanPrs = dayPrs.filter((p) => p.attribution === "human_only");
    const aiLines = aiPrs.reduce((sum, p) => sum + p.additions, 0);
    const humanLines = humanPrs.reduce((sum, p) => sum + p.additions, 0);

    // Weekday rhythm + merge spikes; cap at team size.
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const base = weekend ? Math.max(1, Math.round(teamSize * 0.35)) : teamSize;
    const spike = Math.min(teamSize, base + aiPrs.length + Math.min(1, humanPrs.length));
    const cloud = Math.min(
      spike,
      Math.max(aiPrs.length > 0 ? 2 : weekend ? 0 : 1, Math.round(spike * (aiPrs.length ? 0.7 : 0.35))),
    );
    const bugbot = weekend ? 0 : Math.min(2, 1 + (i % 3 === 0 ? 1 : 0));
    const cli = weekend ? 0 : Math.min(2, (i + 1) % 4 === 0 ? 1 : 0);

    dau.push({
      date,
      dau: spike,
      cli_dau: cli,
      cloud_agent_dau: cloud,
      bugbot_dau: bugbot,
    });

    const suggestedDiffs = Math.max(
      aiPrs.length * 18 + humanPrs.length * 4,
      weekend ? 8 : 22,
    ) + Math.round(aiLines / 40);
    const acceptedDiffs = Math.round(suggestedDiffs * (aiPrs.length ? 0.72 : 0.58));
    const rejectedDiffs = Math.max(0, suggestedDiffs - acceptedDiffs);
    const linesSuggested = Math.max(aiLines + Math.round(humanLines * 0.15), suggestedDiffs * 6);
    const linesAccepted = Math.round(linesSuggested * (acceptedDiffs / Math.max(suggestedDiffs, 1)));

    agentEdits.push({
      event_date: date,
      total_suggested_diffs: suggestedDiffs,
      total_accepted_diffs: acceptedDiffs,
      total_rejected_diffs: rejectedDiffs,
      total_lines_suggested: linesSuggested,
      total_lines_accepted: linesAccepted,
    });

    const tabSuggestions =
      (weekend ? 120 : 420) +
      humanLines +
      Math.round(aiLines * 0.55) +
      dayPrs.length * 80;
    const tabAccepts = Math.round(tabSuggestions * (aiPrs.length ? 0.63 : 0.55));
    const tabRejects = Math.max(0, tabSuggestions - tabAccepts);
    const tabLinesSuggested = Math.round(tabSuggestions * 1.8);
    const tabLinesAccepted = Math.round(tabLinesSuggested * (tabAccepts / Math.max(tabSuggestions, 1)));

    tabs.push({
      event_date: date,
      total_suggestions: tabSuggestions,
      total_accepts: tabAccepts,
      total_rejects: tabRejects,
      total_lines_suggested: tabLinesSuggested,
      total_lines_accepted: tabLinesAccepted,
    });
  }

  return { dau, agentEdits, tabs };
}

function buildModels(
  agentEdits: CursorAgentEditPoint[],
  teamSize: number,
): CursorModelTotal[] {
  const messages = agentEdits.reduce((sum, row) => sum + row.total_accepted_diffs * 9, 0);
  const users = Math.max(1, teamSize);
  const weights: Array<{ model: string; weight: number }> = [
    { model: "claude-sonnet-4.5", weight: 0.52 },
    { model: "composer-1", weight: 0.22 },
    { model: "gpt-4o", weight: 0.16 },
    { model: "claude-opus-4.5", weight: 0.1 },
  ];
  return weights
    .map(({ model, weight }) => ({
      model,
      messages: Math.max(users * 4, Math.round(messages * weight)),
    }))
    .sort((a, b) => b.messages - a.messages);
}

function buildExtensions(
  commits: CursorAiCommit[],
  primaryRepo: string,
): CursorExtensionTotal[] {
  const aiLines = commits.reduce(
    (sum, c) => sum + c.tabLinesAdded + c.composerLinesAdded,
    0,
  );
  const mix = extensionMixForRepo(primaryRepo);
  return mix
    .map(({ extension, weight }) => {
      const linesAccepted = Math.max(12, Math.round(aiLines * weight));
      return {
        extension,
        linesAccepted,
        accepts: Math.max(3, Math.round(linesAccepted / 24)),
      };
    })
    .sort((a, b) => b.linesAccepted - a.linesAccepted);
}

function tokensForPr(pr: ProductivityPullRequest): {
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  aiLines: number;
} {
  const split = splitLines(pr.additions, pr.attribution);
  const aiLines = split.tab + split.composer;
  const perLine =
    pr.attribution === "ai_generated"
      ? 920
      : pr.attribution === "ai_assisted"
        ? 640
        : 95;
  const tokens = Math.max(aiLines * perLine, pr.additions * 48);
  const inputTokens = Math.round(tokens * 0.68);
  const outputTokens = Math.max(0, tokens - inputTokens);
  return { tokens, inputTokens, outputTokens, aiLines };
}

function modelSpendUsd(model: string, tokens: number): number {
  const rate = MODEL_COST_PER_MTOK[model] ?? 9;
  return (tokens / 1_000_000) * rate;
}

function buildTools(input: {
  tabs: CursorTabsPoint[];
  agentEdits: CursorAgentEditPoint[];
  dau: CursorDauPoint[];
  models: CursorModelTotal[];
  totalTokens: number;
}): CursorAiTool[] {
  const { tabs, agentEdits, dau, models, totalTokens } = input;
  const tabTokens = Math.round(totalTokens * 0.28);
  const composerTokens = Math.round(totalTokens * 0.48);
  const bugbotTokens = Math.round(totalTokens * 0.12);
  const cloudTokens = Math.max(
    0,
    totalTokens - tabTokens - composerTokens - bugbotTokens,
  );

  const tabAccepts = tabs.reduce((s, r) => s + r.total_accepts, 0);
  const agentAccepted = agentEdits.reduce((s, r) => s + r.total_accepted_diffs, 0);
  const bugbotDays = dau.filter((d) => d.bugbot_dau > 0).length;
  const cloudDays = dau.filter((d) => d.cloud_agent_dau > 0).length;
  const topModel = models[0]?.model ?? "claude-sonnet-4.5";

  const raw: Array<Omit<CursorAiTool, "sharePct" | "spendUsd"> & { tokens: number }> = [
    {
      id: "cursor-tab",
      name: "Cursor Tab",
      category: "editor",
      activeUnits: tabAccepts,
      tokens: tabTokens,
      hint: "Inline completions accepted this sprint",
    },
    {
      id: "cursor-composer",
      name: "Composer / Agent",
      category: "agent",
      activeUnits: agentAccepted,
      tokens: composerTokens,
      hint: `Agent diffs · primarily ${topModel}`,
    },
    {
      id: "bugbot",
      name: "Bugbot",
      category: "review",
      activeUnits: bugbotDays,
      tokens: bugbotTokens,
      hint: "PR review days with Bugbot activity",
    },
    {
      id: "cloud-agents",
      name: "Cloud Agents",
      category: "cloud",
      activeUnits: cloudDays,
      tokens: cloudTokens,
      hint: "Background / cloud agent active days",
    },
  ];

  const tokenSum = Math.max(
    1,
    raw.reduce((s, t) => s + t.tokens, 0),
  );

  return raw
    .map((tool) => ({
      ...tool,
      spendUsd: Number(modelSpendUsd(topModel, tool.tokens).toFixed(2)),
      sharePct: Math.round((tool.tokens / tokenSum) * 100),
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

function buildTokenSpend(input: {
  models: CursorModelTotal[];
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  ticketsCovered: number;
  ticketsTouched: number;
}): CursorTokenSpend {
  const msgSum = Math.max(
    1,
    input.models.reduce((s, m) => s + m.messages, 0),
  );
  const byModel = input.models.map((m) => {
    const tokens = Math.round(input.totalTokens * (m.messages / msgSum));
    const spendUsd = Number(modelSpendUsd(m.model, tokens).toFixed(2));
    return {
      model: m.model,
      tokens,
      spendUsd,
      sharePct: Math.round((m.messages / msgSum) * 100),
    };
  });
  const totalSpendUsd = Number(
    byModel.reduce((s, m) => s + m.spendUsd, 0).toFixed(2),
  );
  const coveragePct =
    input.ticketsTouched === 0
      ? 0
      : Math.round((input.ticketsCovered / input.ticketsTouched) * 100);

  return {
    totalTokens: input.totalTokens,
    totalSpendUsd,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    byModel,
    coveragePct,
    ticketsCovered: input.ticketsCovered,
    ticketsTouched: input.ticketsTouched,
  };
}

function buildRoi(input: {
  aiLines: number;
  tokenSpendUsd: number;
  seatSpendUsd: number;
  agentAcceptRatePct: number | null;
}): CursorAiRoi {
  const acceptFactor = (input.agentAcceptRatePct ?? 60) / 100;
  const engHoursSaved = Number(
    ((input.aiLines / LINES_PER_ENG_HOUR) * (0.55 + acceptFactor * 0.35)).toFixed(1),
  );
  const engCostSavedUsd = Number((engHoursSaved * BLENDED_HOURLY_USD).toFixed(0));
  const totalAiCostUsd = Number(
    (input.tokenSpendUsd + input.seatSpendUsd).toFixed(2),
  );
  const netValueUsd = Number((engCostSavedUsd - totalAiCostUsd).toFixed(0));
  const roiMultiple =
    totalAiCostUsd > 0
      ? Number((engCostSavedUsd / totalAiCostUsd).toFixed(1))
      : null;

  return {
    engHoursSaved,
    engCostSavedUsd,
    tokenSpendUsd: totalAiCostUsd,
    netValueUsd,
    roiMultiple,
    aiLinesAccepted: input.aiLines,
    blendedHourlyUsd: BLENDED_HOURLY_USD,
    caption:
      roiMultiple != null && roiMultiple >= 1
        ? `About ${roiMultiple}× return vs seats + tokens at $${BLENDED_HOURLY_USD}/hr blended eng cost.`
        : "AI seat + token spend is still catching up to estimated engineering time saved.",
  };
}

function buildTicketUsage(
  merged: ProductivityPullRequest[],
  repos: AppRepo[],
): CursorTicketTokenUsage[] {
  type Acc = {
    jiraKey: string;
    summary: string;
    repoName: string;
    prCount: number;
    aiLines: number;
    tokens: number;
    attributions: Set<AiAttribution>;
  };
  const byKey = new Map<string, Acc>();

  for (const pr of merged) {
    const keys = pr.jiraKeys.length > 0 ? pr.jiraKeys : [`PR-${pr.number}`];
    const { tokens, aiLines } = tokensForPr(pr);
    const repo = repoFullName(pr, repos);
    const share = keys.length;
    for (const jiraKey of keys) {
      const prev = byKey.get(jiraKey) ?? {
        jiraKey,
        summary: pr.title,
        repoName: repo,
        prCount: 0,
        aiLines: 0,
        tokens: 0,
        attributions: new Set<AiAttribution>(),
      };
      prev.prCount += 1;
      prev.aiLines += aiLines / share;
      prev.tokens += tokens / share;
      prev.attributions.add(pr.attribution);
      if (prev.summary.length < pr.title.length) prev.summary = pr.title;
      byKey.set(jiraKey, prev);
    }
  }

  return [...byKey.values()]
    .map((row) => {
      const attrs = [...row.attributions];
      const attribution: CursorTicketTokenUsage["attribution"] =
        attrs.length > 1
          ? "mixed"
          : (attrs[0] ?? "human_only");
      return {
        jiraKey: row.jiraKey,
        summary: row.summary,
        repoName: row.repoName,
        prCount: row.prCount,
        aiLines: Math.round(row.aiLines),
        tokens: Math.round(row.tokens),
        spendUsd: Number(modelSpendUsd("claude-sonnet-4.5", row.tokens).toFixed(2)),
        attribution,
      };
    })
    .sort((a, b) => b.tokens - a.tokens);
}

function buildContributorUsage(
  productivity: ProductivitySnapshot,
  merged: ProductivityPullRequest[],
): CursorContributorTokenUsage[] {
  const byAuthor = new Map<
    string,
    { tokens: number; aiLines: number; prCount: number; tickets: Set<string> }
  >();

  for (const pr of merged) {
    const { tokens, aiLines } = tokensForPr(pr);
    const prev = byAuthor.get(pr.authorId) ?? {
      tokens: 0,
      aiLines: 0,
      prCount: 0,
      tickets: new Set<string>(),
    };
    prev.tokens += tokens;
    prev.aiLines += aiLines;
    prev.prCount += 1;
    for (const key of pr.jiraKeys) prev.tickets.add(key);
    byAuthor.set(pr.authorId, prev);
  }

  return productivity.contributors
    .map((c) => {
      const stats = byAuthor.get(c.contributor.id) ?? {
        tokens: 0,
        aiLines: 0,
        prCount: 0,
        tickets: new Set<string>(),
      };
      return {
        contributorId: c.contributor.id,
        displayName: c.contributor.displayName,
        avatarInitials: c.contributor.avatarInitials,
        teamKey: c.contributor.teamKey,
        tokens: Math.round(stats.tokens),
        spendUsd: Number(modelSpendUsd("claude-sonnet-4.5", stats.tokens).toFixed(2)),
        ticketKeys: [...stats.tickets].sort(),
        prCount: stats.prCount,
        aiLines: Math.round(stats.aiLines),
        aiSharePct: Math.round(c.aiShare * 100),
      };
    })
    .filter((row) => row.prCount > 0 || row.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
}

export function buildCursorAiSnapshotFromProductivity(input: {
  productivity: ProductivitySnapshot;
  dimensions: AppDimensions;
  lastSyncAt: string | null;
}): CursorAiSnapshot {
  const { productivity, dimensions, lastSyncAt } = input;
  const sprint =
    dimensions.sprints.find((s) => s.id === productivity.sprintId) ??
    dimensions.sprints.find((s) => s.id === dimensions.defaultSprintId) ??
    dimensions.sprints[0];

  const start = sprint?.start ?? "2026-08-27";
  const end = sprint?.end ?? "2026-09-09";
  const dates = eachDateInclusive(start, end);

  const prs = Object.values(productivity.pullRequestsById);
  const merged = prs.filter((pr) => pr.mergedAt);
  const teamSize = Math.max(
    1,
    productivity.contributors.length ||
      new Set(merged.map((pr) => pr.authorId)).size ||
      5,
  );

  const commits = buildCommits(merged, dimensions.repos, productivity.sprintId);
  const { dau, agentEdits, tabs } = buildDailySeries(dates, merged, teamSize);

  const agentAccepted = agentEdits.reduce((s, r) => s + r.total_accepted_diffs, 0);
  const agentSuggested = agentEdits.reduce((s, r) => s + r.total_suggested_diffs, 0);
  const tabAccepts = tabs.reduce((s, r) => s + r.total_accepts, 0);
  const tabSuggestions = tabs.reduce((s, r) => s + r.total_suggestions, 0);

  const latestDau = dau.at(-1) ?? null;
  const primaryRepo =
    dimensions.repos[0]?.fullName ??
    dimensions.repos[0]?.name ??
    commits[0]?.repoName ??
    "neoito/connexus-platform";

  const aiAttributed = merged.filter((pr) => pr.attribution !== "human_only").length;
  const models = buildModels(agentEdits, teamSize);

  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let aiLines = 0;
  for (const pr of merged) {
    const t = tokensForPr(pr);
    totalTokens += t.tokens;
    inputTokens += t.inputTokens;
    outputTokens += t.outputTokens;
    aiLines += t.aiLines;
  }

  const tickets = buildTicketUsage(merged, dimensions.repos);
  const ticketsTouched = tickets.length;
  const ticketsCovered = tickets.filter((t) => t.tokens > 0 && t.aiLines > 0).length;
  const tokenSpend = buildTokenSpend({
    models,
    totalTokens,
    inputTokens,
    outputTokens,
    ticketsCovered,
    ticketsTouched,
  });
  const tools = buildTools({
    tabs,
    agentEdits,
    dau,
    models,
    totalTokens,
  });
  const agentAcceptRatePct = pct(agentAccepted, agentSuggested);
  const seatSpendUsd = teamSize * SEAT_COST_PER_SPRINT_USD;
  const roi = buildRoi({
    aiLines,
    tokenSpendUsd: tokenSpend.totalSpendUsd,
    seatSpendUsd,
    agentAcceptRatePct,
  });

  return {
    source: "appdata-mock",
    fetchedAt: lastSyncAt ?? new Date().toISOString(),
    kpis: {
      latestDau: latestDau?.dau ?? null,
      latestDauDate: latestDau?.date ?? null,
      agentAcceptRatePct,
      agentAccepted,
      agentSuggested,
      tabAcceptRatePct: pct(tabAccepts, tabSuggestions),
      tabAccepts,
      tabSuggestions,
      aiCommitsTracked: commits.length || aiAttributed || null,
    },
    dau,
    agentEdits,
    tabs,
    models,
    extensions: buildExtensions(commits, primaryRepo),
    commits,
    tools,
    tokenSpend,
    roi,
    tickets,
    contributors: buildContributorUsage(productivity, merged),
    warnings: [],
  };
}
