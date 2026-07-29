import { forOrgRead } from "@/lib/prisma";

export async function getLatestProductivityRun(
  organizationId: string,
  options?: {
    repositoryName?: string;
    branch?: string;
  },
) {
  const db = forOrgRead(organizationId);

  const where: Record<string, unknown> = {
    status: "VERIFIED",
  };

  if (options?.repositoryName) where.repositoryName = options.repositoryName;
  if (options?.branch) where.branch = options.branch;

  return db.productivityAnalysisRun.findFirst({
    where,
    orderBy: { analyzedAt: "desc" },
    select: {
      id: true,
      analyzedAt: true,
      repositoryName: true,
      branch: true,
      reportPath: true,
      headlineTotalCommits: true,
      headlineNonMergeCommits: true,
      headlineActiveDays: true,
      headlineNetGrowthProduct: true,
      remoteBranches: true,
      strongestSignals: true,
      weakestSignals: true,
      verifiedAt: true,
    },
  });
}

export async function getProductivityTrend(
  organizationId: string,
  limit: number,
) {
  const db = forOrgRead(organizationId);
  const take = Math.max(1, Math.min(limit, 100));

  return db.productivityAnalysisRun.findMany({
    where: { status: "VERIFIED" },
    orderBy: { analyzedAt: "desc" },
    take,
    select: {
      id: true,
      analyzedAt: true,
      repositoryName: true,
      branch: true,
      headlineTotalCommits: true,
      headlineNonMergeCommits: true,
      headlineActiveDays: true,
      headlineNetGrowthProduct: true,
    },
  });
}

