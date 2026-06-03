import type {
  AiAttribution,
  CodeAnalysisCommit,
  CodeAnalysisPullRequest,
  CodeAnalysisSnapshot,
  CodeAnalysisFilters,
  TimeRange,
  TrendBucket,
} from "@/lib/code-analysis/types";

const RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const RANGE_MS: Record<TimeRange, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

function isAiAttribution(a: AiAttribution): boolean {
  return a === "ai_assisted" || a === "ai_generated";
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function computeKpis(
  prs: CodeAnalysisPullRequest[],
  commits: CodeAnalysisCommit[],
): CodeAnalysisSnapshot["kpis"] {
  const totalLines = commits.reduce((n, c) => n + c.additions, 0);
  const aiLines = commits
    .filter((c) => isAiAttribution(c.attribution))
    .reduce((n, c) => n + c.additions, 0);
  const aiCommits = commits.filter((c) => isAiAttribution(c.attribution)).length;
  const aiPrs = prs.filter((p) => isAiAttribution(p.attribution)).length;
  const highAiPrs = prs.filter((p) => isAiAttribution(p.attribution));
  const reviewedHighAi = highAiPrs.filter((p) => p.reviewCount > 0).length;

  return {
    aiLinesPct: pct(aiLines, totalLines),
    aiLinesPctDelta: 0,
    aiCommitsPct: pct(aiCommits, commits.length),
    aiCommitsPctDelta: 0,
    aiPrsPct: pct(aiPrs, prs.length),
    aiPrsPctDelta: 0,
    reviewCoverageOnAiPrsPct:
      highAiPrs.length > 0 ? pct(reviewedHighAi, highAiPrs.length) : 100,
  };
}

function applyKpiDeltas(
  current: CodeAnalysisSnapshot["kpis"],
  prior: CodeAnalysisSnapshot["kpis"],
): CodeAnalysisSnapshot["kpis"] {
  return {
    ...current,
    aiLinesPctDelta: current.aiLinesPct - prior.aiLinesPct,
    aiCommitsPctDelta: current.aiCommitsPct - prior.aiCommitsPct,
    aiPrsPctDelta: current.aiPrsPct - prior.aiPrsPct,
  };
}

function buildTrend(
  commits: CodeAnalysisCommit[],
  prs: CodeAnalysisPullRequest[],
  range: TimeRange,
): TrendBucket[] {
  const byBucket = new Map<
    string,
    { human_only: number; ai_assisted: number; ai_generated: number; commits: number; prs: number }
  >();

  for (const c of commits) {
    const d = new Date(c.committedAt);
    const key =
      range === "7d"
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : range === "30d"
          ? `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : d.toLocaleDateString("en-US", { month: "short" });
    const bucket = byBucket.get(key) ?? {
      human_only: 0,
      ai_assisted: 0,
      ai_generated: 0,
      commits: 0,
      prs: 0,
    };
    bucket.commits += 1;
    if (c.attribution === "human_only" || c.attribution === "unknown") {
      bucket.human_only += c.additions;
    } else if (c.attribution === "ai_assisted") {
      bucket.ai_assisted += c.additions;
    } else {
      bucket.ai_generated += c.additions;
    }
    byBucket.set(key, bucket);
  }

  for (const p of prs) {
    const d = new Date(p.mergedAt);
    const key =
      range === "7d"
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : range === "30d"
          ? `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : d.toLocaleDateString("en-US", { month: "short" });
    const bucket = byBucket.get(key);
    if (bucket) bucket.prs += 1;
  }

  return [...byBucket.entries()].map(([bucket, v]) => ({
    bucket,
    human_only: v.human_only,
    ai_assisted: v.ai_assisted,
    ai_generated: v.ai_generated,
    commits: v.commits,
    prs: v.prs,
  }));
}

function buildFiles(commits: CodeAnalysisCommit[], repos: string[]): CodeAnalysisSnapshot["files"] {
  const byPath = new Map<
    string,
    { repo: string; changes: number; ai: number; total: number; authors: Set<string> }
  >();

  for (const c of commits) {
    for (const signal of c.signals) {
      const match = signal.match(/^File:\s*(.+)$/);
      if (!match) continue;
      const path = match[1];
      const cur = byPath.get(path) ?? {
        repo: c.repo,
        changes: 0,
        ai: 0,
        total: 0,
        authors: new Set<string>(),
      };
      cur.changes += 1;
      cur.total += c.additions;
      if (isAiAttribution(c.attribution)) cur.ai += c.additions;
      cur.authors.add(c.author);
      byPath.set(path, cur);
    }
  }

  return [...byPath.entries()]
    .map(([path, v]) => ({
      path,
      repo: v.repo,
      changeCount: v.changes,
      aiLinesPct: pct(v.ai, v.total),
      topContributors: [...v.authors].slice(0, 3),
    }))
    .filter((f) => repos.includes(f.repo))
    .sort((a, b) => b.changeCount - a.changeCount)
    .slice(0, 12);
}

function buildGovernanceSignals(
  prs: CodeAnalysisPullRequest[],
  commits: CodeAnalysisCommit[],
  repos: string[],
  aiLinesPct: number,
): CodeAnalysisSnapshot["governanceSignals"] {
  const signals: CodeAnalysisSnapshot["governanceSignals"] = [];

  for (const pr of prs) {
    if (isAiAttribution(pr.attribution) && pr.reviewCount === 0) {
      signals.push({
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

  for (const c of commits) {
    if (c.attribution === "ai_generated" && c.additions > 500) {
      signals.push({
        id: `sig-commit-${c.sha}`,
        severity: "warning",
        title: "Large fully-AI commit",
        description: `Commit ${c.sha.slice(0, 7)} added ${c.additions} lines with ${c.confidence}% AI confidence.`,
        entityLabel: c.message.split("\n")[0].slice(0, 80),
        entityUrl: c.url,
        repo: c.repo,
      });
    }
  }

  if (aiLinesPct > 35) {
    signals.push({
      id: "sig-spike",
      severity: "info",
      title: "Elevated AI contribution",
      description: `${aiLinesPct}% of added lines are AI-attributed in this period.`,
      entityLabel: "Org-wide",
      repo: repos[0] ?? "—",
    });
  }

  const orgAvg = aiLinesPct;
  const repoStats = new Map<string, { ai: number; total: number }>();
  for (const c of commits) {
    const cur = repoStats.get(c.repo) ?? { ai: 0, total: 0 };
    cur.total += c.additions;
    if (isAiAttribution(c.attribution)) cur.ai += c.additions;
    repoStats.set(c.repo, cur);
  }
  for (const [repo, v] of repoStats) {
    const repoPct = pct(v.ai, v.total);
    if (orgAvg > 10 && repoPct > orgAvg * 2) {
      signals.push({
        id: `sig-outlier-${repo}`,
        severity: "info",
        title: "Repo AI outlier",
        description: `${repo} is at ${repoPct}% AI lines vs ${orgAvg}% org average.`,
        entityLabel: repo,
        repo,
      });
    }
  }

  return signals;
}

export function filterByTimeRange<T extends { committedAt?: string; mergedAt?: string }>(
  items: T[],
  range: TimeRange,
  dateField: "committedAt" | "mergedAt",
): T[] {
  const cutoff = Date.now() - RANGE_MS[range];
  return items.filter((item) => {
    const iso = item[dateField];
    if (!iso) return false;
    return new Date(iso).getTime() >= cutoff;
  });
}

export function filterPriorPeriod<T extends { committedAt?: string; mergedAt?: string }>(
  items: T[],
  range: TimeRange,
  dateField: "committedAt" | "mergedAt",
): T[] {
  const end = Date.now() - RANGE_MS[range];
  const start = end - RANGE_MS[range];
  return items.filter((item) => {
    const iso = item[dateField];
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= start && t < end;
  });
}

export function computeCodeAnalysisSnapshot(input: {
  prs: CodeAnalysisPullRequest[];
  commits: CodeAnalysisCommit[];
  range: TimeRange;
  repos: string[];
  priorPrs?: CodeAnalysisPullRequest[];
  priorCommits?: CodeAnalysisCommit[];
}): CodeAnalysisSnapshot {
  const { prs, commits, range, repos } = input;

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
    for (const tool of classifyToolsFromCommit(c)) {
      const cur = toolMap.get(tool) ?? {
        name: tool,
        linesAttributed: 0,
        commitsAttributed: 0,
        prsAttributed: 0,
      };
      cur.commitsAttributed += 1;
      cur.linesAttributed += c.additions;
      toolMap.set(tool, cur);
    }
  }

  let kpis = computeKpis(prs, commits);
  if (input.priorPrs && input.priorCommits) {
    const priorKpis = computeKpis(input.priorPrs, input.priorCommits);
    kpis = applyKpiDeltas(kpis, priorKpis);
  }

  return {
    generatedAt: new Date().toISOString(),
    rangeLabel: RANGE_LABELS[range],
    repos,
    kpis,
    attribution,
    trend: buildTrend(commits, prs, range),
    byRepo: [...byRepoMap.entries()]
      .map(([repo, v]) => ({
        repo,
        aiLinesPct: pct(v.ai, v.total),
        totalLines: v.total,
      }))
      .sort((a, b) => b.totalLines - a.totalLines),
    byAuthor: [...byAuthorMap.entries()]
      .map(([login, v]) => ({
        login,
        aiLinesPct: pct(v.ai, v.total),
        commits: v.commits,
      }))
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 8),
    pullRequests: prs,
    commits,
    files: buildFiles(commits, repos),
    tools: [...toolMap.values()].sort((a, b) => b.linesAttributed - a.linesAttributed),
    governanceSignals: buildGovernanceSignals(prs, commits, repos, kpis.aiLinesPct),
  };
}

function classifyToolsFromCommit(c: CodeAnalysisCommit): string[] {
  const tools: string[] = [];
  const text = c.signals.join(" ");
  if (/copilot/i.test(text)) tools.push("Copilot");
  if (/cursor/i.test(text)) tools.push("Cursor");
  if (/chatgpt/i.test(text)) tools.push("ChatGPT");
  return tools;
}

export function snapshotForStoredData(
  stored: { pullRequests: CodeAnalysisPullRequest[]; commits: CodeAnalysisCommit[] },
  filters: Partial<CodeAnalysisFilters>,
): CodeAnalysisSnapshot {
  const range = filters.range ?? "30d";
  const allRepos = [
    ...new Set([
      ...stored.pullRequests.map((p) => p.repo),
      ...stored.commits.map((c) => c.repo),
    ]),
  ];
  const selectedRepos =
    filters.repos && filters.repos.length > 0 ? filters.repos : allRepos;

  let prs = stored.pullRequests.filter((p) => selectedRepos.includes(p.repo));
  let commits = stored.commits.filter((c) => selectedRepos.includes(c.repo));

  if (filters.author) {
    prs = prs.filter((p) => p.author === filters.author);
    commits = commits.filter((c) => c.author === filters.author);
  }

  const prsInRange = filterByTimeRange(prs, range, "mergedAt");
  const commitsInRange = filterByTimeRange(commits, range, "committedAt");
  const priorPrs = filterPriorPeriod(prs, range, "mergedAt");
  const priorCommits = filterPriorPeriod(commits, range, "committedAt");

  return computeCodeAnalysisSnapshot({
    prs: prsInRange,
    commits: commitsInRange,
    range,
    repos: selectedRepos,
    priorPrs,
    priorCommits,
  });
}
