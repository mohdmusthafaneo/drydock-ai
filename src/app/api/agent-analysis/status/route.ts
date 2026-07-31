import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadLatestAgentAnalysis } from "@/lib/agent-analysis/load-latest-runs";
import { resolveOrgAgentTargets } from "@/mastra/workflows/agent-analysis-refresh/resolve-targets";

/** Latest verified agent-run timestamps + which domains can run given integrations. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = session.organizationId;
  const [bundle, targets] = await Promise.all([
    loadLatestAgentAnalysis(organizationId),
    resolveOrgAgentTargets(organizationId),
  ]);

  return NextResponse.json({
    organizationId,
    targets: {
      qa: targets.qa,
      devops: Boolean(targets.devops),
      productivity: targets.productivity
        ? {
            repoCount: targets.productivity.repos.length,
            repositories: targets.productivity.repos.map((r) => r.fullName),
          }
        : null,
      governance: targets.governance
        ? {
            repoCount: targets.governance.repos.length,
            repositories: targets.governance.repos.map((r) => r.fullName),
            revspec: targets.governance.revspec,
          }
        : null,
    },
    latest: {
      qa: bundle.qa
        ? {
            id: bundle.qa.id,
            analyzedAt: bundle.qa.analyzedAt,
            openBugs: bundle.qa.openBugs,
            blocked: bundle.qa.blocked,
          }
        : null,
      devops: bundle.devops
        ? {
            id: bundle.devops.id,
            analyzedAt: bundle.devops.analyzedAt,
            findings: bundle.devops.findingsCount,
            resources: bundle.devops.resourcesCount,
          }
        : null,
      governance: bundle.governance
        ? {
            id: bundle.governance.id,
            analyzedAt: bundle.governance.analyzedAt,
            riskScore: bundle.governance.riskScore,
            repositoryCount: bundle.governance.repositoryCount,
            repositories: bundle.governance.repositories,
          }
        : null,
      productivity: bundle.productivity
        ? {
            id: bundle.productivity.id,
            analyzedAt: bundle.productivity.analyzedAt,
            commits: bundle.productivity.totalCommits,
            repositoryCount: bundle.productivity.repositoryCount,
            repositories: bundle.productivity.repositories,
          }
        : null,
    },
    freshness: bundle.freshness,
  });
}
