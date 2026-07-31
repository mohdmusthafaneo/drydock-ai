import { asSystem } from "@/lib/prisma";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { parseJiraMeta } from "@/lib/jira-meta";
import { isAwsTrulyConnected } from "@/lib/aws-meta";
import { isJiraOAuthConnected } from "@/lib/jira-meta";

export type RepoTarget = {
  fullName: string;
  repoUrl: string;
  branch: string;
};

export type OrgAgentTargets = {
  organizationId: string;
  qa: { projectKeys: string[] } | null;
  devops: { configured: true } | null;
  productivity: { repos: RepoTarget[] } | null;
  governance: { repos: RepoTarget[]; revspec: string } | null;
};

function githubRepoUrl(fullName: string): string {
  return `https://github.com/${fullName}.git`;
}

/** All org-selected GitHub repos with per-repo default branch. */
function listRepoTargets(
  meta: ReturnType<typeof parseIntegrationMeta>,
): RepoTarget[] {
  const fullNames =
    meta.repoFullNames && meta.repoFullNames.length > 0
      ? meta.repoFullNames
      : (meta.repos?.map((r) => r.fullName) ??
        meta.githubSchemaSnapshot?.repos?.map((r) => r.fullName) ??
        []);

  const fallbackBranch =
    meta.githubSchemaSnapshot?.suggestions?.productionBranch?.value ?? "main";

  const seen = new Set<string>();
  const out: RepoTarget[] = [];
  for (const fullName of fullNames) {
    const key = fullName.toLowerCase();
    if (!fullName.trim() || seen.has(key)) continue;
    seen.add(key);

    const branch =
      meta.repos?.find((r) => r.fullName.toLowerCase() === key)?.defaultBranch ??
      meta.githubSchemaSnapshot?.repos?.find(
        (r) => r.fullName.toLowerCase() === key,
      )?.defaultBranch ??
      fallbackBranch;

    out.push({
      fullName,
      repoUrl: githubRepoUrl(fullName),
      branch,
    });
  }
  return out;
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
    const repos = listRepoTargets(meta);
    if (repos.length > 0) {
      productivity = { repos };
      governance = {
        repos,
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
