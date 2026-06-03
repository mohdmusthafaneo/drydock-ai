import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrganizationContext } from "@/lib/org-data";
import { prisma } from "@/lib/prisma";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { PageHeader } from "@/components/layout/page-header";
import { CodeAnalysisDashboard } from "@/components/code-analysis/code-analysis-dashboard";
import { ConnectGitHubEmpty } from "@/components/code-analysis/connect-github-empty";
import { getAvailableMockRepos } from "@/lib/code-analysis/mock-data";

export default async function CodeAnalysisPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { workspaceMode: true, name: true },
  });

  if (org?.workspaceMode === "MVP") {
    redirect("/accelerator");
  }

  const ctx = await getOrganizationContext(session.organizationId);
  if (!ctx.dna) redirect("/governance/setup");

  const github = ctx.integrations.find(
    (i) => i.provider === "GITHUB" && i.status === "CONNECTED",
  );

  const githubConnected = Boolean(github);
  const githubMeta = github ? parseIntegrationMeta(github.metadataJson) : null;
  const repoNames =
    githubMeta?.repos?.map((r) => r.fullName) ?? getAvailableMockRepos();

  return (
    <div className="w-full space-y-8 pb-24 lg:pb-8">
      <PageHeader
        title="Code analysis"
        description="Measure how much of your merged code, commits, and pull requests are human-only, AI-assisted, or fully AI-generated — so leaders can govern AI-native delivery with evidence."
      />

      {!githubConnected ? (
        <ConnectGitHubEmpty />
      ) : (
        <CodeAnalysisDashboard
          lastSyncedAt={github?.lastSyncAt?.toISOString() ?? null}
          connectedRepos={repoNames}
        />
      )}
    </div>
  );
}
