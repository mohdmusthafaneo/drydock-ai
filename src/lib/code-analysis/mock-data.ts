import type {
  AiAttribution,
  CodeAnalysisCommit,
  CodeAnalysisFilters,
  CodeAnalysisPullRequest,
  CodeAnalysisSnapshot,
  TimeRange,
  TrendBucket,
} from "@/lib/code-analysis/types";

const MOCK_REPOS = ["aidos-neo/platform", "aidos-neo/web-client", "aidos-neo/api-gateway"];

const MOCK_PRS: CodeAnalysisPullRequest[] = [
  {
    id: "pr-1",
    number: 142,
    title: "Add governance policy validation middleware",
    repo: "aidos-neo/platform",
    author: "alex.chen",
    mergedAt: "2026-05-28T14:22:00Z",
    url: "https://github.com/aidos-neo/platform/pull/142",
    linesAdded: 412,
    linesRemoved: 38,
    attribution: "ai_assisted",
    confidence: 78,
    reviewCount: 2,
    tools: ["Cursor"],
  },
  {
    id: "pr-2",
    number: 89,
    title: "Scaffold Jira delivery health dashboard widgets",
    repo: "aidos-neo/web-client",
    author: "samira.k",
    mergedAt: "2026-05-26T09:10:00Z",
    url: "https://github.com/aidos-neo/web-client/pull/89",
    linesAdded: 1240,
    linesRemoved: 12,
    attribution: "ai_generated",
    confidence: 91,
    reviewCount: 0,
    tools: ["Copilot", "Cursor"],
  },
  {
    id: "pr-3",
    number: 67,
    title: "Fix webhook signature verification edge case",
    repo: "aidos-neo/api-gateway",
    author: "jordan.lee",
    mergedAt: "2026-05-24T16:45:00Z",
    url: "https://github.com/aidos-neo/api-gateway/pull/67",
    linesAdded: 48,
    linesRemoved: 22,
    attribution: "human_only",
    confidence: 95,
    reviewCount: 1,
    tools: [],
  },
  {
    id: "pr-4",
    number: 141,
    title: "Refactor org-data context loader for parallel queries",
    repo: "aidos-neo/platform",
    author: "alex.chen",
    mergedAt: "2026-05-22T11:30:00Z",
    url: "https://github.com/aidos-neo/platform/pull/141",
    linesAdded: 186,
    linesRemoved: 204,
    attribution: "ai_assisted",
    confidence: 72,
    reviewCount: 2,
    tools: ["Cursor"],
  },
  {
    id: "pr-5",
    number: 88,
    title: "Mobile nav safe-area padding for iOS",
    repo: "aidos-neo/web-client",
    author: "morgan.t",
    mergedAt: "2026-05-20T08:00:00Z",
    url: "https://github.com/aidos-neo/web-client/pull/88",
    linesAdded: 64,
    linesRemoved: 18,
    attribution: "human_only",
    confidence: 88,
    reviewCount: 1,
    tools: [],
  },
  {
    id: "pr-6",
    number: 66,
    title: "Generate OpenAPI client from GitHub sync schema",
    repo: "aidos-neo/api-gateway",
    author: "samira.k",
    mergedAt: "2026-05-18T13:15:00Z",
    url: "https://github.com/aidos-neo/api-gateway/pull/66",
    linesAdded: 890,
    linesRemoved: 4,
    attribution: "ai_generated",
    confidence: 86,
    reviewCount: 1,
    tools: ["Copilot"],
  },
  {
    id: "pr-7",
    number: 140,
    title: "Audit log export CSV formatter",
    repo: "aidos-neo/platform",
    author: "jordan.lee",
    mergedAt: "2026-05-15T10:00:00Z",
    url: "https://github.com/aidos-neo/platform/pull/140",
    linesAdded: 156,
    linesRemoved: 44,
    attribution: "ai_assisted",
    confidence: 65,
    reviewCount: 2,
    tools: ["ChatGPT"],
  },
  {
    id: "pr-8",
    number: 87,
    title: "Theme token migration for light mode",
    repo: "aidos-neo/web-client",
    author: "morgan.t",
    mergedAt: "2026-05-12T17:20:00Z",
    url: "https://github.com/aidos-neo/web-client/pull/87",
    linesAdded: 320,
    linesRemoved: 280,
    attribution: "human_only",
    confidence: 92,
    reviewCount: 2,
    tools: [],
  },
];

const MOCK_COMMITS: CodeAnalysisCommit[] = [
  {
    sha: "a1b2c3d",
    message: "feat(governance): add policy gate for high-AI PRs",
    repo: "aidos-neo/platform",
    author: "alex.chen",
    committedAt: "2026-05-28T14:20:00Z",
    url: "https://github.com/aidos-neo/platform/commit/a1b2c3d",
    additions: 210,
    deletions: 12,
    attribution: "ai_assisted",
    confidence: 74,
    signals: ["Co-authored-by: Cursor <noreply@cursor.com>"],
  },
  {
    sha: "e4f5g6h",
    message: "chore: regenerate API types",
    repo: "aidos-neo/api-gateway",
    author: "samira.k",
    committedAt: "2026-05-26T09:08:00Z",
    url: "https://github.com/aidos-neo/api-gateway/commit/e4f5g6h",
    additions: 890,
    deletions: 4,
    attribution: "ai_generated",
    confidence: 93,
    signals: ["Bulk addition (>300 lines)", "Message: Generated with Copilot"],
  },
  {
    sha: "i7j8k9l",
    message: "fix: webhook HMAC timing-safe compare",
    repo: "aidos-neo/api-gateway",
    author: "jordan.lee",
    committedAt: "2026-05-24T16:44:00Z",
    url: "https://github.com/aidos-neo/api-gateway/commit/i7j8k9l",
    additions: 18,
    deletions: 8,
    attribution: "human_only",
    confidence: 96,
    signals: [],
  },
  {
    sha: "m0n1o2p",
    message: "refactor: parallelize org context queries",
    repo: "aidos-neo/platform",
    author: "alex.chen",
    committedAt: "2026-05-22T11:28:00Z",
    url: "https://github.com/aidos-neo/platform/commit/m0n1o2p",
    additions: 94,
    deletions: 102,
    attribution: "ai_assisted",
    confidence: 68,
    signals: ["PR body mentions Cursor"],
  },
  {
    sha: "q3r4s5t",
    message: "ui: safe-area padding on mobile nav",
    repo: "aidos-neo/web-client",
    author: "morgan.t",
    committedAt: "2026-05-20T07:58:00Z",
    url: "https://github.com/aidos-neo/web-client/commit/q3r4s5t",
    additions: 32,
    deletions: 6,
    attribution: "human_only",
    confidence: 90,
    signals: [],
  },
  {
    sha: "u6v7w8x",
    message: "feat: code analysis page shell",
    repo: "aidos-neo/platform",
    author: "alex.chen",
    committedAt: "2026-06-01T10:00:00Z",
    url: "https://github.com/aidos-neo/platform/commit/u6v7w8x",
    additions: 520,
    deletions: 0,
    attribution: "ai_generated",
    confidence: 88,
    signals: ["Bulk addition (>300 lines)", "Generated with Cursor"],
  },
  {
    sha: "y9z0a1b",
    message: "docs: update jira integration spec",
    repo: "aidos-neo/platform",
    author: "samira.k",
    committedAt: "2026-05-19T15:30:00Z",
    url: "https://github.com/aidos-neo/platform/commit/y9z0a1b",
    additions: 84,
    deletions: 12,
    attribution: "ai_assisted",
    confidence: 55,
    signals: ["ChatGPT footer in commit message"],
  },
  {
    sha: "c2d3e4f",
    message: "style: migrate CSS variables for light theme",
    repo: "aidos-neo/web-client",
    author: "morgan.t",
    committedAt: "2026-05-12T17:18:00Z",
    url: "https://github.com/aidos-neo/web-client/commit/c2d3e4f",
    additions: 160,
    deletions: 140,
    attribution: "human_only",
    confidence: 91,
    signals: [],
  },
];

const TREND_BY_RANGE: Record<TimeRange, TrendBucket[]> = {
  "7d": [
    { bucket: "May 28", human_only: 420, ai_assisted: 280, ai_generated: 190, commits: 8, prs: 2 },
    { bucket: "May 29", human_only: 180, ai_assisted: 120, ai_generated: 90, commits: 5, prs: 1 },
    { bucket: "May 30", human_only: 310, ai_assisted: 200, ai_generated: 140, commits: 7, prs: 1 },
    { bucket: "May 31", human_only: 250, ai_assisted: 160, ai_generated: 110, commits: 6, prs: 1 },
    { bucket: "Jun 1", human_only: 140, ai_assisted: 380, ai_generated: 520, commits: 9, prs: 2 },
    { bucket: "Jun 2", human_only: 220, ai_assisted: 150, ai_generated: 80, commits: 6, prs: 1 },
    { bucket: "Jun 3", human_only: 90, ai_assisted: 60, ai_generated: 40, commits: 3, prs: 0 },
  ],
  "30d": [
    { bucket: "May 5", human_only: 890, ai_assisted: 420, ai_generated: 180, commits: 22, prs: 4 },
    { bucket: "May 12", human_only: 720, ai_assisted: 510, ai_generated: 290, commits: 24, prs: 5 },
    { bucket: "May 19", human_only: 640, ai_assisted: 480, ai_generated: 380, commits: 26, prs: 6 },
    { bucket: "May 26", human_only: 580, ai_assisted: 620, ai_generated: 520, commits: 28, prs: 7 },
    { bucket: "Jun 2", human_only: 460, ai_assisted: 540, ai_generated: 410, commits: 25, prs: 5 },
  ],
  "90d": [
    { bucket: "Mar", human_only: 4200, ai_assisted: 1800, ai_generated: 900, commits: 95, prs: 18 },
    { bucket: "Apr", human_only: 3800, ai_assisted: 2400, ai_generated: 1400, commits: 102, prs: 21 },
    { bucket: "May", human_only: 3200, ai_assisted: 2900, ai_generated: 2100, commits: 118, prs: 24 },
    { bucket: "Jun", human_only: 980, ai_assisted: 870, ai_generated: 640, commits: 32, prs: 8 },
  ],
};

const RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

function isAiAttribution(a: AiAttribution): boolean {
  return a === "ai_assisted" || a === "ai_generated";
}

function computeSnapshot(
  prs: CodeAnalysisPullRequest[],
  commits: CodeAnalysisCommit[],
  range: TimeRange,
  repos: string[],
): CodeAnalysisSnapshot {
  const totalLines = commits.reduce((n, c) => n + c.additions, 0);
  const aiLines = commits
    .filter((c) => isAiAttribution(c.attribution))
    .reduce((n, c) => n + c.additions, 0);
  const aiCommits = commits.filter((c) => isAiAttribution(c.attribution)).length;
  const aiPrs = prs.filter((p) => isAiAttribution(p.attribution)).length;
  const highAiPrs = prs.filter(
    (p) => p.attribution === "ai_generated" || p.attribution === "ai_assisted",
  );
  const reviewedHighAi = highAiPrs.filter((p) => p.reviewCount > 0).length;

  const attribution: CodeAnalysisSnapshot["attribution"] = {
    human_only: { count: 0, lines: 0 },
    ai_assisted: { count: 0, lines: 0 },
    ai_generated: { count: 0, lines: 0 },
    unknown: { count: 0, lines: 0 },
  };

  for (const c of commits) {
    attribution[c.attribution].count += 1;
    attribution[c.attribution].lines += c.additions;
  }

  const byRepoMap = new Map<string, { ai: number; total: number }>();
  for (const c of commits) {
    const cur = byRepoMap.get(c.repo) ?? { ai: 0, total: 0 };
    cur.total += c.additions;
    if (isAiAttribution(c.attribution)) cur.ai += c.additions;
    byRepoMap.set(c.repo, cur);
  }

  const byAuthorMap = new Map<string, { ai: number; total: number; commits: number }>();
  for (const c of commits) {
    const cur = byAuthorMap.get(c.author) ?? { ai: 0, total: 0, commits: 0 };
    cur.commits += 1;
    cur.total += c.additions;
    if (isAiAttribution(c.attribution)) cur.ai += c.additions;
    byAuthorMap.set(c.author, cur);
  }

  const toolMap = new Map<string, CodeAnalysisSnapshot["tools"][0]>();
  for (const pr of prs) {
    for (const tool of pr.tools) {
      const cur = toolMap.get(tool) ?? {
        name: tool,
        linesAttributed: 0,
        commitsAttributed: 0,
        prsAttributed: 0,
      };
      cur.prsAttributed += 1;
      cur.linesAttributed += pr.linesAdded;
      toolMap.set(tool, cur);
    }
  }
  for (const c of commits) {
    for (const signal of c.signals) {
      if (signal.includes("Copilot")) {
        const cur = toolMap.get("Copilot") ?? {
          name: "Copilot",
          linesAttributed: 0,
          commitsAttributed: 0,
          prsAttributed: 0,
        };
        cur.commitsAttributed += 1;
        cur.linesAttributed += c.additions;
        toolMap.set("Copilot", cur);
      }
      if (signal.includes("Cursor")) {
        const cur = toolMap.get("Cursor") ?? {
          name: "Cursor",
          linesAttributed: 0,
          commitsAttributed: 0,
          prsAttributed: 0,
        };
        cur.commitsAttributed += 1;
        cur.linesAttributed += c.additions;
        toolMap.set("Cursor", cur);
      }
      if (signal.includes("ChatGPT")) {
        const cur = toolMap.get("ChatGPT") ?? {
          name: "ChatGPT",
          linesAttributed: 0,
          commitsAttributed: 0,
          prsAttributed: 0,
        };
        cur.commitsAttributed += 1;
        cur.linesAttributed += c.additions;
        toolMap.set("ChatGPT", cur);
      }
    }
  }

  const files = [
    {
      path: "src/lib/code-analysis/mock-data.ts",
      repo: "aidos-neo/platform",
      changeCount: 12,
      aiLinesPct: 88,
      topContributors: ["alex.chen"],
    },
    {
      path: "src/components/code-analysis/analysis-tabs.tsx",
      repo: "aidos-neo/platform",
      changeCount: 9,
      aiLinesPct: 76,
      topContributors: ["alex.chen", "samira.k"],
    },
    {
      path: "src/app/(platform)/code-analysis/page.tsx",
      repo: "aidos-neo/platform",
      changeCount: 4,
      aiLinesPct: 62,
      topContributors: ["alex.chen"],
    },
    {
      path: "src/lib/jira-delivery-health.ts",
      repo: "aidos-neo/platform",
      changeCount: 7,
      aiLinesPct: 45,
      topContributors: ["samira.k"],
    },
    {
      path: "src/components/layout/mobile-nav.tsx",
      repo: "aidos-neo/web-client",
      changeCount: 5,
      aiLinesPct: 12,
      topContributors: ["morgan.t"],
    },
    {
      path: "src/app/api/webhooks/[provider]/route.ts",
      repo: "aidos-neo/api-gateway",
      changeCount: 6,
      aiLinesPct: 28,
      topContributors: ["jordan.lee"],
    },
  ].filter((f) => repos.includes(f.repo));

  const governanceSignals: CodeAnalysisSnapshot["governanceSignals"] = [];

  for (const pr of prs) {
    if (isAiAttribution(pr.attribution) && pr.reviewCount === 0) {
      governanceSignals.push({
        id: `sig-${pr.id}`,
        severity: pr.attribution === "ai_generated" ? "error" : "warning",
        title: "High-AI PR merged without review",
        description: `PR #${pr.number} had ${pr.confidence}% AI confidence and zero approvals before merge.`,
        entityLabel: `#${pr.number} · ${pr.title}`,
        entityUrl: pr.url,
        repo: pr.repo,
      });
    }
  }

  if (aiLines / Math.max(totalLines, 1) > 0.35) {
    governanceSignals.push({
      id: "sig-spike",
      severity: "info",
      title: "Elevated AI contribution",
      description: `${Math.round((aiLines / Math.max(totalLines, 1)) * 100)}% of added lines are AI-attributed in this period.`,
      entityLabel: "Org-wide",
      repo: repos[0] ?? "—",
    });
  }

  const aiLinesPct = totalLines > 0 ? Math.round((aiLines / totalLines) * 100) : 0;
  const aiCommitsPct =
    commits.length > 0 ? Math.round((aiCommits / commits.length) * 100) : 0;
  const aiPrsPct = prs.length > 0 ? Math.round((aiPrs / prs.length) * 100) : 0;
  const reviewCoverageOnAiPrsPct =
    highAiPrs.length > 0 ? Math.round((reviewedHighAi / highAiPrs.length) * 100) : 100;

  const rangeScale = range === "7d" ? 0.35 : range === "90d" ? 1.15 : 1;

  return {
    generatedAt: new Date().toISOString(),
    rangeLabel: RANGE_LABELS[range],
    repos,
    kpis: {
      aiLinesPct,
      aiLinesPctDelta: Math.round(4 * rangeScale),
      aiCommitsPct,
      aiCommitsPctDelta: Math.round(2 * rangeScale),
      aiPrsPct,
      aiPrsPctDelta: range === "7d" ? -1 : 1,
      reviewCoverageOnAiPrsPct,
    },
    attribution,
    trend: TREND_BY_RANGE[range],
    byRepo: [...byRepoMap.entries()]
      .map(([repo, v]) => ({
        repo,
        aiLinesPct: v.total > 0 ? Math.round((v.ai / v.total) * 100) : 0,
        totalLines: v.total,
      }))
      .sort((a, b) => b.totalLines - a.totalLines),
    byAuthor: [...byAuthorMap.entries()]
      .map(([login, v]) => ({
        login,
        aiLinesPct: v.total > 0 ? Math.round((v.ai / v.total) * 100) : 0,
        commits: v.commits,
      }))
      .sort((a, b) => b.commits - a.commits),
    pullRequests: prs,
    commits,
    files,
    tools: [...toolMap.values()].sort((a, b) => b.linesAttributed - a.linesAttributed),
    governanceSignals,
  };
}

export function getMockCodeAnalysisSnapshot(
  filters: Partial<CodeAnalysisFilters> = {},
): CodeAnalysisSnapshot {
  const range = filters.range ?? "30d";
  const selectedRepos =
    filters.repos && filters.repos.length > 0 ? filters.repos : MOCK_REPOS;

  let prs = MOCK_PRS.filter((p) => selectedRepos.includes(p.repo));
  let commits = MOCK_COMMITS.filter((c) => selectedRepos.includes(c.repo));

  if (filters.author) {
    prs = prs.filter((p) => p.author === filters.author);
    commits = commits.filter((c) => c.author === filters.author);
  }

  if (range === "7d") {
    prs = prs.slice(0, 4);
    commits = commits.slice(0, 5);
  } else if (range === "90d") {
    // keep all — represents longer window
  }

  return computeSnapshot(prs, commits, range, selectedRepos);
}

export function getAvailableMockRepos(): string[] {
  return MOCK_REPOS;
}

export function getAvailableMockAuthors(): string[] {
  return [...new Set(MOCK_COMMITS.map((c) => c.author))].sort();
}
