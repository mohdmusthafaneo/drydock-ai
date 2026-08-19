import type { Integration } from "@/generated/prisma/client";
import { computeCodeAnalysisSnapshot } from "@/lib/code-analysis/compute-snapshot";
import type { GovernanceSignal } from "@/lib/code-analysis/types";
import { parseIntegrationMeta } from "@/lib/integration-meta";

const RELEASE_WINDOW_DAYS = 14;

export type CodeAnalysisAssessContext = {
  connected: boolean;
  synced: boolean;
  aiLinesPct: number | null;
  aiPrsPct: number | null;
  reviewCoverageOnAiPrsPct: number | null;
  governanceSignals: GovernanceSignal[];
};

function filterByReleaseWindow<T extends { mergedAt?: string; committedAt?: string }>(
  items: T[],
  dateKey: "mergedAt" | "committedAt",
): T[] {
  const since = Date.now() - RELEASE_WINDOW_DAYS * 86400000;
  return items.filter((item) => {
    const raw = item[dateKey];
    if (!raw) return false;
    return new Date(raw).getTime() >= since;
  });
}

export function resolveCodeAnalysisAssessContext(input: {
  integrations: Integration[];
  repos?: string[];
  branch?: string | null;
}): CodeAnalysisAssessContext {
  const empty: CodeAnalysisAssessContext = {
    connected: false,
    synced: false,
    aiLinesPct: null,
    aiPrsPct: null,
    reviewCoverageOnAiPrsPct: null,
    governanceSignals: [],
  };

  const github = input.integrations.find((i) => i.provider === "GITHUB");
  if (!github || github.status !== "CONNECTED") return empty;

  const meta = parseIntegrationMeta(github.metadataJson);
  const stored = meta.codeAnalysisSnapshot;
  if (!stored || (!stored.pullRequests.length && !stored.commits.length)) {
    return { ...empty, connected: true, synced: false };
  }

  const repos =
    input.repos && input.repos.length > 0 ? input.repos : stored.repos;

  const prs = filterByReleaseWindow(stored.pullRequests, "mergedAt").filter((p) =>
    repos.includes(p.repo),
  );
  let commits = filterByReleaseWindow(stored.commits, "committedAt").filter((c) =>
    repos.includes(c.repo),
  );

  if (input.branch?.trim()) {
    const branch = input.branch.trim();
    commits = commits.filter((c) => !c.branch || c.branch === branch);
  }

  if (prs.length === 0 && commits.length === 0) {
    return { ...empty, connected: true, synced: true };
  }

  const snapshot = computeCodeAnalysisSnapshot({
    prs,
    commits,
    range: "30d",
    repos,
  });

  return {
    connected: true,
    synced: true,
    aiLinesPct: snapshot.kpis.aiLinesPct,
    aiPrsPct: snapshot.kpis.aiPrsPct,
    reviewCoverageOnAiPrsPct: snapshot.kpis.reviewCoverageOnAiPrsPct,
    governanceSignals: snapshot.governanceSignals.slice(0, 5),
  };
}
