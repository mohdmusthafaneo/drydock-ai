import { asSystem, prisma } from "@/lib/prisma";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import type {
  LatestGovernanceRunSummary,
  LatestProductivityRunSummary,
} from "@/lib/agent-analysis/types";

/** Org-selected GitHub repo full names (owner/repo). Empty when GitHub is not connected. */
export async function loadSelectedRepoFullNames(
  organizationId: string,
): Promise<string[]> {
  const github = await asSystem().integration.findFirst({
    where: { organizationId, provider: "GITHUB", status: "CONNECTED" },
    select: { metadataJson: true },
  });
  if (!github) return [];
  const meta = parseIntegrationMeta(github.metadataJson);
  if (meta.repoFullNames && meta.repoFullNames.length > 0) {
    return [...new Set(meta.repoFullNames)];
  }
  const fromRepos = meta.repos?.map((r) => r.fullName) ?? [];
  if (fromRepos.length > 0) return [...new Set(fromRepos)];
  return [
    ...new Set(meta.githubSchemaSnapshot?.repos?.map((r) => r.fullName) ?? []),
  ];
}

/**
 * Names stored on analysis runs may be `owner/repo` (current) or bare `repo`
 * (legacy). Expand selected full names so both forms match.
 */
export function expandRepoNameAliases(fullNames: string[]): string[] {
  const out = new Set<string>();
  for (const name of fullNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    out.add(trimmed);
    const slash = trimmed.lastIndexOf("/");
    if (slash >= 0 && slash < trimmed.length - 1) {
      out.add(trimmed.slice(slash + 1));
    }
  }
  return [...out];
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function riskLevelRank(level: string | null | undefined): number {
  switch ((level ?? "").toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function prefixPath(repo: string, filePath: string | null | undefined): string {
  if (!filePath) return repo;
  if (filePath.startsWith(`${repo}/`)) return filePath;
  return `${repo}/${filePath}`;
}

type ProductivityRunRow = Awaited<
  ReturnType<typeof loadProductivityRunsForRepos>
>[number];

type GovernanceRunRow = Awaited<
  ReturnType<typeof loadGovernanceRunsForRepos>
>[number];

async function loadProductivityRunsForRepos(
  organizationId: string,
  repositoryNames: string[],
) {
  if (repositoryNames.length === 0) return [];
  return prisma.productivityAnalysisRun.findMany({
    where: {
      organizationId,
      status: "VERIFIED",
      repositoryName: { in: repositoryNames },
    },
    orderBy: [{ repositoryName: "asc" }, { analyzedAt: "desc" }],
    distinct: ["repositoryName"],
    include: {
      contributors: { orderBy: { rank: "asc" }, take: 50 },
      weeklyVolume: { orderBy: { isoWeek: "asc" } },
      commitTypeBreakdown: { orderBy: { count: "desc" } },
    },
  });
}

async function loadGovernanceRunsForRepos(
  organizationId: string,
  repositoryNames: string[],
) {
  if (repositoryNames.length === 0) return [];
  return prisma.governanceAnalysisRun.findMany({
    where: {
      organizationId,
      status: "VERIFIED",
      repositoryName: { in: repositoryNames },
    },
    orderBy: [{ repositoryName: "asc" }, { analyzedAt: "desc" }],
    distinct: ["repositoryName"],
    include: {
      worstFiles: { orderBy: { rank: "asc" }, take: 10 },
      riskDrivers: { orderBy: { rank: "asc" }, take: 8 },
      deadCodeFindings: { orderBy: { rank: "asc" }, take: 10 },
    },
  });
}

/** Latest verified productivity run per selected repo, aggregated to one org summary. */
export function rollupProductivity(
  runs: ProductivityRunRow[],
  organizationId: string,
): LatestProductivityRunSummary | null {
  if (runs.length === 0) return null;

  const repositories = runs.map((r) => r.repositoryName);
  const analyzedAt = runs
    .map((r) => r.analyzedAt)
    .sort((a, b) => a.getTime() - b.getTime())[0]!
    .toISOString();

  let totalCommits = 0;
  let filesTouched = 0;
  let prsMerged = 0;
  let hasCommits = false;
  let hasFiles = false;
  let hasPrs = false;

  const contributorMap = new Map<
    string,
    { authorName: string; commits: number; net: number }
  >();
  const weekMap = new Map<string, number>();
  const typeMap = new Map<string, number>();
  const strongest: string[] = [];
  const weakest: string[] = [];
  const tldrParts: string[] = [];

  for (const run of runs) {
    if (run.headlineTotalCommits != null) {
      totalCommits += run.headlineTotalCommits;
      hasCommits = true;
    }
    if (run.headlineFilesTouched != null) {
      filesTouched += run.headlineFilesTouched;
      hasFiles = true;
    }
    if (run.headlinePrsMerged != null) {
      prsMerged += run.headlinePrsMerged;
      hasPrs = true;
    }
    if (run.tlDr?.trim()) tldrParts.push(`${run.repositoryName}: ${run.tlDr.trim()}`);
    strongest.push(...run.strongestSignals);
    weakest.push(...run.weakestSignals);

    for (const c of run.contributors) {
      const prev = contributorMap.get(c.authorName);
      if (prev) {
        prev.commits += c.commits;
        prev.net += c.net;
      } else {
        contributorMap.set(c.authorName, {
          authorName: c.authorName,
          commits: c.commits,
          net: c.net,
        });
      }
    }
    for (const w of run.weeklyVolume) {
      weekMap.set(w.isoWeek, (weekMap.get(w.isoWeek) ?? 0) + w.commits);
    }
    for (const t of run.commitTypeBreakdown) {
      typeMap.set(t.commitType, (typeMap.get(t.commitType) ?? 0) + t.count);
    }
  }

  const commitTotalForShare = [...contributorMap.values()].reduce(
    (s, c) => s + c.commits,
    0,
  );
  const contributors = [...contributorMap.values()]
    .map((c) => ({
      authorName: c.authorName,
      commits: c.commits,
      net: c.net,
      sharePct:
        commitTotalForShare > 0
          ? Math.round((c.commits / commitTotalForShare) * 1000) / 10
          : 0,
      rank: null as number | null,
    }))
    .sort((a, b) => b.commits - a.commits)
    .map((c, i) => ({ ...c, rank: i + 1 }))
    .slice(0, 10);

  const typeTotal = [...typeMap.values()].reduce((s, n) => s + n, 0);
  const commitTypes = [...typeMap.entries()]
    .map(([commitType, count]) => ({
      commitType,
      count,
      sharePct: typeTotal > 0 ? Math.round((count / typeTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const feat = typeMap.get("feat") ?? 0;
  const fix = typeMap.get("fix") ?? 0;
  const featFixRatio = fix > 0 ? feat / fix : feat > 0 ? feat : null;

  const weeklyVolume = [...weekMap.entries()]
    .map(([isoWeek, commits]) => ({ isoWeek, commits }))
    .sort((a, b) => a.isoWeek.localeCompare(b.isoWeek));

  const primary = runs[0]!;
  const multi = repositories.length > 1;
  return {
    id:
      runs.length === 1
        ? primary.id
        : `rollup:productivity:${organizationId}`,
    analyzedAt,
    status: "VERIFIED",
    repositoryName: multi
      ? `${repositories.length} repositories`
      : repositories[0]!,
    branch: multi ? "default branches" : primary.branch,
    totalCommits: hasCommits ? totalCommits : null,
    filesTouched: hasFiles ? filesTouched : null,
    prsMerged: hasPrs ? prsMerged : null,
    featFixRatio,
    tlDr: tldrParts.slice(0, 3).join(" · "),
    strongestSignals: dedupePreserveOrder(strongest),
    weakestSignals: dedupePreserveOrder(weakest),
    contributors,
    weeklyVolume,
    commitTypes,
    repositoryCount: repositories.length,
    repositories,
  };
}

/** Latest verified governance run per selected repo, aggregated to one org summary. */
export function rollupGovernance(
  runs: GovernanceRunRow[],
  organizationId: string,
): LatestGovernanceRunSummary | null {
  if (runs.length === 0) return null;

  const repositories = runs.map((r) => r.repositoryName);
  const analyzedAt = runs
    .map((r) => r.analyzedAt)
    .sort((a, b) => a.getTime() - b.getTime())[0]!
    .toISOString();

  const highest = [...runs].sort((a, b) => {
    const scoreDiff = (b.headlineRiskScore ?? -1) - (a.headlineRiskScore ?? -1);
    if (scoreDiff !== 0) return scoreDiff;
    return riskLevelRank(b.headlineRiskLevel) - riskLevelRank(a.headlineRiskLevel);
  })[0]!;

  let findingsCount = 0;
  let deadCodeCount = 0;
  const worstFiles: LatestGovernanceRunSummary["worstFiles"] = [];
  const deadCode: LatestGovernanceRunSummary["deadCode"] = [];

  for (const run of runs) {
    findingsCount += run.headlineFindingsCount ?? 0;
    deadCodeCount += run.headlineDeadCodeFindingsCount ?? 0;
    for (const f of run.worstFiles) {
      worstFiles.push({
        rank: f.rank,
        filePath: prefixPath(run.repositoryName, f.filePath),
        score: f.score,
        maxCcn: f.maxCcn,
        hasTestFile: f.hasTestFile,
      });
    }
    for (const d of run.deadCodeFindings) {
      deadCode.push({
        rank: d.rank,
        kind: d.kind,
        filePath: d.filePath
          ? prefixPath(run.repositoryName, d.filePath)
          : d.filePath,
        reason: d.reason,
        cleanupReady: d.cleanupReady,
      });
    }
  }

  worstFiles.sort((a, b) => (a.score ?? 999) - (b.score ?? 999));
  const topWorst = worstFiles.slice(0, 10).map((f, i) => ({ ...f, rank: i + 1 }));
  deadCode.sort((a, b) => a.rank - b.rank);
  const topDead = deadCode.slice(0, 10).map((d, i) => ({ ...d, rank: i + 1 }));

  return {
    id:
      runs.length === 1
        ? highest.id
        : `rollup:governance:${organizationId}`,
    analyzedAt,
    status: "VERIFIED",
    repositoryName: highest.repositoryName,
    revspec: highest.revspec,
    riskScore: highest.headlineRiskScore,
    probability: highest.headlineProbability,
    riskLevel: highest.headlineRiskLevel,
    reviewPriority: highest.headlineReviewPriority,
    summary: highest.headlineSummary,
    worstFilePath: highest.headlineWorstFilePath
      ? prefixPath(highest.repositoryName, highest.headlineWorstFilePath)
      : topWorst[0]?.filePath ?? null,
    findingsCount,
    deadCodeCount,
    worstFiles: topWorst,
    riskDrivers: highest.riskDrivers.map((d) => ({
      rank: d.rank,
      label: d.label,
      contribution: d.contribution,
    })),
    deadCode: topDead,
    repositoryCount: repositories.length,
    repositories,
  };
}

export async function loadRolledUpProductivityRun(
  organizationId: string,
): Promise<LatestProductivityRunSummary | null> {
  const selected = await loadSelectedRepoFullNames(organizationId);
  // Prefer selected repos; if none selected, fall back to any verified runs (legacy).
  if (selected.length > 0) {
    const runs = await loadProductivityRunsForRepos(
      organizationId,
      expandRepoNameAliases(selected),
    );
    const rolled = rollupProductivity(runs, organizationId);
    return normalizeRollupRepoLabels(rolled, selected);
  }

  const fallback = await prisma.productivityAnalysisRun.findMany({
    where: { organizationId, status: "VERIFIED" },
    orderBy: [{ repositoryName: "asc" }, { analyzedAt: "desc" }],
    distinct: ["repositoryName"],
    include: {
      contributors: { orderBy: { rank: "asc" }, take: 50 },
      weeklyVolume: { orderBy: { isoWeek: "asc" } },
      commitTypeBreakdown: { orderBy: { count: "desc" } },
    },
  });
  return rollupProductivity(fallback, organizationId);
}

export async function loadRolledUpGovernanceRun(
  organizationId: string,
): Promise<LatestGovernanceRunSummary | null> {
  const selected = await loadSelectedRepoFullNames(organizationId);
  if (selected.length > 0) {
    const runs = await loadGovernanceRunsForRepos(
      organizationId,
      expandRepoNameAliases(selected),
    );
    const rolled = rollupGovernance(runs, organizationId);
    return normalizeRollupRepoLabels(rolled, selected);
  }

  const fallback = await prisma.governanceAnalysisRun.findMany({
    where: { organizationId, status: "VERIFIED" },
    orderBy: [{ repositoryName: "asc" }, { analyzedAt: "desc" }],
    distinct: ["repositoryName"],
    include: {
      worstFiles: { orderBy: { rank: "asc" }, take: 10 },
      riskDrivers: { orderBy: { rank: "asc" }, take: 8 },
      deadCodeFindings: { orderBy: { rank: "asc" }, take: 10 },
    },
  });
  return rollupGovernance(fallback, organizationId);
}

/** Prefer owner/repo labels from selection when runs still use bare names. */
function normalizeRollupRepoLabels<
  T extends {
    repositoryName: string;
    repositories: string[];
    repositoryCount: number;
    worstFilePath?: string | null;
    worstFiles?: Array<{ filePath: string; [k: string]: unknown }>;
    deadCode?: Array<{ filePath: string | null; [k: string]: unknown }>;
  } | null,
>(rolled: T, selectedFullNames: string[]): T {
  if (!rolled) return rolled;

  const byBare = new Map<string, string>();
  for (const full of selectedFullNames) {
    const bare = full.includes("/") ? full.slice(full.lastIndexOf("/") + 1) : full;
    byBare.set(bare.toLowerCase(), full);
  }

  const mapRepoLabel = (name: string) => {
    if (!name.includes("/")) {
      return byBare.get(name.toLowerCase()) ?? name;
    }
    // Already owner/repo (exactly two segments) — keep.
    if (name.split("/").length === 2) return name;
    // Path or multi-segment: rewrite bare prefix if present.
    return rewritePrefixedPath(name) ?? name;
  };

  function rewritePrefixedPath(path: string | null | undefined): string | null {
    if (!path) return path ?? null;
    for (const [bare, full] of byBare) {
      const barePrefix = bare + "/";
      const fullPrefix = full.toLowerCase() + "/";
      const lower = path.toLowerCase();
      if (lower.startsWith(fullPrefix)) return path;
      if (lower.startsWith(barePrefix)) {
        return `${full}/${path.slice(bare.length + 1)}`;
      }
    }
    return path;
  }

  const repositories = [...new Set(rolled.repositories.map(mapRepoLabel))];

  return {
    ...rolled,
    repositoryName: mapRepoLabel(rolled.repositoryName),
    repositories,
    repositoryCount: repositories.length,
    ...(rolled.worstFilePath !== undefined
      ? { worstFilePath: rewritePrefixedPath(rolled.worstFilePath) }
      : {}),
    ...(rolled.worstFiles
      ? {
          worstFiles: rolled.worstFiles.map((f) => ({
            ...f,
            filePath: rewritePrefixedPath(f.filePath) ?? f.filePath,
          })),
        }
      : {}),
    ...(rolled.deadCode
      ? {
          deadCode: rolled.deadCode.map((d) => ({
            ...d,
            filePath: rewritePrefixedPath(d.filePath),
          })),
        }
      : {}),
  };
}
