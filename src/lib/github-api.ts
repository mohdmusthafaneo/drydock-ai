import { decryptToken, encryptToken } from "@/lib/token-crypto";
import { parseIntegrationMeta, type GitHubIntegrationMeta } from "@/lib/integration-meta";
import type { Integration } from "@/generated/prisma/client";

const GITHUB_API = "https://api.github.com";

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function getGitHubAccessToken(integration: Integration): string | null {
  const meta = parseIntegrationMeta(integration.metadataJson);
  if (!meta.accessTokenEnc) return null;
  try {
    return decryptToken(meta.accessTokenEnc);
  } catch {
    return null;
  }
}

async function githubFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new GitHubApiError(text || res.statusText, res.status);
  }

  return res.json() as Promise<T>;
}

export type GitHubRepo = {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
  updated_at: string;
  open_issues_count: number;
};

export async function listUserRepos(accessToken: string, perPage = 30) {
  return githubFetch<GitHubRepo[]>(
    accessToken,
    `/user/repos?per_page=${perPage}&sort=updated&affiliation=owner,collaborator,organization_member`,
  );
}

export type InstallationRepoList = {
  repositories: GitHubRepo[];
  total_count: number;
};

/** Repos granted to the GitHub App installation (installation access token). */
export async function listInstallationRepos(
  accessToken: string,
  perPage = 100,
): Promise<GitHubRepo[]> {
  const data = await githubFetch<InstallationRepoList>(
    accessToken,
    `/installation/repositories?per_page=${perPage}`,
  );
  return data.repositories ?? [];
}

export async function getRepo(accessToken: string, owner: string, repo: string) {
  return githubFetch<GitHubRepo>(accessToken, `/repos/${owner}/${repo}`);
}

/** @deprecated Use org metadata `repoFullNames` — env allowlist removed for SaaS multi-tenancy */
export function getGitHubSyncRepoAllowlist(): string[] {
  return [];
}

export type GitHubPull = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
  user: { login: string } | null;
};

export async function listOpenPulls(accessToken: string, owner: string, repo: string) {
  return githubFetch<GitHubPull[]>(
    accessToken,
    `/repos/${owner}/${repo}/pulls?state=open&per_page=10&sort=updated`,
  );
}

export type GitHubWorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_branch: string;
  created_at: string;
  updated_at: string;
};

export async function listWorkflowRuns(
  accessToken: string,
  owner: string,
  repo: string,
  perPage = 5,
) {
  const data = await githubFetch<{ workflow_runs: GitHubWorkflowRun[] }>(
    accessToken,
    `/repos/${owner}/${repo}/actions/runs?per_page=${perPage}`,
  );
  return data.workflow_runs ?? [];
}

export function parseOwnerRepo(fullName: string) {
  const [owner, ...rest] = fullName.split("/");
  return { owner, repo: rest.join("/") };
}

export function formatGitHubSyncError(e: unknown): string {
  if (e instanceof GitHubApiError) {
    if (e.status === 401) return "GitHub App token expired or invalid — try syncing again.";
    if (e.status === 403) return "GitHub App lacks permission for this repository.";
    if (e.status === 404) return "Repository not found or not granted to the GitHub App.";
    return `GitHub API error (${e.status})`;
  }
  return e instanceof Error ? e.message : "GitHub sync failed";
}

export function buildOAuthMeta(input: {
  existing?: GitHubIntegrationMeta;
  accessToken: string;
  githubUser: { login: string; id: number };
  scope: string;
  userId: string;
}): GitHubIntegrationMeta {
  return {
    ...input.existing,
    mode: "oauth",
    githubLogin: input.githubUser.login,
    githubId: input.githubUser.id,
    scope: input.scope,
    accessTokenEnc: encryptToken(input.accessToken),
    connectedBy: input.userId,
  };
}
