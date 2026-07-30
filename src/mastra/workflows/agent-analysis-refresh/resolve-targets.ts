import { asSystem } from "@/lib/prisma";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { parseJiraMeta } from "@/lib/jira-meta";
import { isAwsTrulyConnected } from "@/lib/aws-meta";
import { isJiraOAuthConnected } from "@/lib/jira-meta";

export type OrgAgentTargets = {
  organizationId: string;
  qa: { projectKeys: string[] } | null;
  devops: { configured: true } | null;
  productivity: { repoUrl: string; branch: string } | null;
  governance: { repoUrl: string; branch: string; revspec: string } | null;
};

function githubRepoUrl(fullName: string): string {
  return `https://github.com/${fullName}.git`;
}

function pickPrimaryRepo(meta: ReturnType<typeof parseIntegrationMeta>): {
  fullName: string;
  branch: string;
} | null {
  const fullName =
    meta.repoFullNames?.[0] ??
    meta.repos?.[0]?.fullName ??
    meta.githubSchemaSnapshot?.repos?.[0]?.fullName;
  if (!fullName) return null;

  const branch =
    meta.repos?.find((r) => r.fullName === fullName)?.defaultBranch ??
    meta.githubSchemaSnapshot?.repos?.find((r) => r.fullName === fullName)
      ?.defaultBranch ??
    meta.githubSchemaSnapshot?.suggestions?.productionBranch?.value ??
    "main";

  return { fullName, branch };
}

/** Resolve which domain agents can run for an org from Integration metadata. */
export async function resolveOrgAgentTargets(
  organizationId: string,
): Promise<OrgAgentTargets> {
  const integrations = await asSystem().integration.findMany({
    where: { organizationId, status: "CONNECTED" },
  });

  const jira = integrations.find((i) => i.provider === "JIRA");
  const github = integrations.find((i) => i.provider === "GITHUB");
  const aws = integrations.find((i) => i.provider === "AWS");

  let qa: OrgAgentTargets["qa"] = null;
  if (jira && isJiraOAuthConnected(jira)) {
    const meta = parseJiraMeta(jira.metadataJson);
    const projectKeys = meta.projectKeys ?? [];
    if (projectKeys.length > 0) {
      qa = { projectKeys };
    }
  }

  let devops: OrgAgentTargets["devops"] = null;
  if (isAwsTrulyConnected(aws)) {
    devops = { configured: true };
  }

  let productivity: OrgAgentTargets["productivity"] = null;
  let governance: OrgAgentTargets["governance"] = null;
  if (github?.status === "CONNECTED") {
    const meta = parseIntegrationMeta(github.metadataJson);
    const repo = pickPrimaryRepo(meta);
    if (repo) {
      const repoUrl = githubRepoUrl(repo.fullName);
      productivity = { repoUrl, branch: repo.branch };
      governance = {
        repoUrl,
        branch: repo.branch,
        revspec: "HEAD~20..HEAD",
      };
    }
  }

  return { organizationId, qa, devops, productivity, governance };
}

export async function listAgentAnalysisOrganizationIds(
  organizationId?: string,
): Promise<string[]> {
  const rows = await asSystem().deliveryDNA.findMany({
    where: organizationId ? { organizationId } : undefined,
    select: { organizationId: true },
    orderBy: { organizationId: "asc" },
  });
  return rows.map((r) => r.organizationId);
}
