import type { Integration } from "@/generated/prisma/client";
import {
  parseIntegrationMeta,
  type GitHubWorkflowRunSummary,
} from "@/lib/integration-meta";

export type GitHubAssessContext = {
  connected: boolean;
  synced: boolean;
  ci: {
    passRatePct: number | null;
    lastConclusion: "success" | "failure" | "cancelled" | null;
    consecutiveFailures: number;
    lastRunAt: string | null;
  } | null;
  changeRisk: {
    openPrs: number;
    mergedPrs7d: number;
  } | null;
};

type ScopedRun = GitHubWorkflowRunSummary & { repo: string };

function normalizeConclusion(
  raw: string | null | undefined,
): "success" | "failure" | "cancelled" | null {
  if (raw === "success" || raw === "failure" || raw === "cancelled") return raw;
  return null;
}

function collectRuns(
  repos: ReturnType<typeof parseIntegrationMeta>["repos"],
  branch: string | null,
): ScopedRun[] {
  const allRuns: ScopedRun[] = (repos ?? []).flatMap((repo) =>
    (repo.recentWorkflowRuns ?? []).map((run) => ({ ...run, repo: repo.fullName })),
  );

  if (!branch) return allRuns;
  const onBranch = allRuns.filter((run) => run.headBranch === branch);
  return onBranch.length > 0 ? onBranch : allRuns;
}

function computeConsecutiveFailures(runs: ScopedRun[]): number {
  const sorted = [...runs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  let count = 0;
  for (const run of sorted) {
    const conclusion = normalizeConclusion(run.conclusion);
    if (conclusion === "failure") count += 1;
    else if (conclusion === "success") break;
  }
  return count;
}

export function resolveGitHubAssessContext(input: {
  integrations: Integration[];
  releaseBranch?: string | null;
}): GitHubAssessContext {
  const github = input.integrations.find((i) => i.provider === "GITHUB");

  if (!github || github.status !== "CONNECTED") {
    return { connected: false, synced: false, ci: null, changeRisk: null };
  }

  const meta = parseIntegrationMeta(github.metadataJson);
  const repos = meta.repos ?? [];
  const synced = repos.length > 0 && Boolean(github.lastSyncAt);

  if (!synced) {
    return { connected: true, synced: false, ci: null, changeRisk: null };
  }

  const branch = input.releaseBranch?.trim() || null;
  const runs = collectRuns(repos, branch);
  const completedRuns = runs.filter((run) => normalizeConclusion(run.conclusion) != null);

  let passRatePct: number | null = null;
  if (completedRuns.length > 0) {
    const passes = completedRuns.filter(
      (run) => normalizeConclusion(run.conclusion) === "success",
    ).length;
    passRatePct = Math.round((passes / completedRuns.length) * 100);
  }

  const sorted = [...runs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const lastRun = sorted[0];

  const openPrs = repos.reduce((sum, repo) => sum + (repo.openPrs ?? 0), 0);

  return {
    connected: true,
    synced: true,
    ci: {
      passRatePct,
      lastConclusion: lastRun ? normalizeConclusion(lastRun.conclusion) : null,
      consecutiveFailures: computeConsecutiveFailures(runs),
      lastRunAt: lastRun?.updatedAt ?? null,
    },
    changeRisk: {
      openPrs,
      mergedPrs7d: 0,
    },
  };
}
