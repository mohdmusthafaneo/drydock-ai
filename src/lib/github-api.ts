import { decryptToken, encryptToken } from "@/lib/token-crypto";
import { parseIntegrationMeta, type GitHubIntegrationMeta } from "@/lib/integration-meta";
import type { Integration } from "@/generated/prisma/client";
import { httpFetch, HttpResponseError } from "@/lib/http/client";

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

async function githubFetch<T>(
  accessToken: string,
  path: string,
  scope?: { organizationId?: string },
): Promise<T> {
  let res: Response;
  try {
    res = await httpFetch({
      url: `${GITHUB_API}${path}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      scope: { provider: "github", organizationId: scope?.organizationId },
    });
  } catch (err) {
    const status = err instanceof HttpResponseError ? err.status : 502;
    const text = err instanceof HttpResponseError ? err.bodyText ?? err.message : String(err);
    throw new GitHubApiError(text || "GitHub API request failed", status);
  }

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
  labels?: Array<{ name: string }>;
};

export type GitHubBranch = {
  name: string;
};

export async function listBranches(
  accessToken: string,
  owner: string,
  repo: string,
  perPage = 30,
) {
  return githubFetch<GitHubBranch[]>(
    accessToken,
    `/repos/${owner}/${repo}/branches?per_page=${perPage}`,
  );
}

export async function listOpenPulls(
  accessToken: string,
  owner: string,
  repo: string,
  perPage = 100,
) {
  return githubFetch<GitHubPull[]>(
    accessToken,
    `/repos/${owner}/${repo}/pulls?state=open&per_page=${perPage}&sort=updated`,
  );
}

export type GitHubCommitListItem = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { date: string; name?: string } | null;
    committer: { date: string } | null;
  };
  author: { login: string } | null;
};

export async function listCommits(
  accessToken: string,
  owner: string,
  repo: string,
  options?: { since?: string; perPage?: number; sha?: string },
) {
  const perPage = options?.perPage ?? 100;
  const since = options?.since ? `&since=${encodeURIComponent(options.since)}` : "";
  const sha = options?.sha ? `&sha=${encodeURIComponent(options.sha)}` : "";
  return githubFetch<GitHubCommitListItem[]>(
    accessToken,
    `/repos/${owner}/${repo}/commits?per_page=${perPage}${since}${sha}`,
  );
}

export type GitHubCommitDetail = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { date: string } | null;
  };
  author: { login: string } | null;
  stats?: { additions: number; deletions: number; total: number };
  files?: { filename: string; additions: number; deletions: number; changes: number }[];
};

export async function getCommit(
  accessToken: string,
  owner: string,
  repo: string,
  sha: string,
) {
  return githubFetch<GitHubCommitDetail>(
    accessToken,
    `/repos/${owner}/${repo}/commits/${sha}`,
  );
}

export type GitHubClosedPull = GitHubPull & {
  merged_at: string | null;
  body: string | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  head?: { ref: string };
  merge_commit_sha?: string | null;
};

export async function listClosedPulls(
  accessToken: string,
  owner: string,
  repo: string,
  perPage = 100,
) {
  return githubFetch<GitHubClosedPull[]>(
    accessToken,
    `/repos/${owner}/${repo}/pulls?state=closed&per_page=${perPage}&sort=updated`,
  );
}

export type GitHubPullFile = {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

export async function getPullRequestFiles(
  accessToken: string,
  owner: string,
  repo: string,
  pullNumber: number,
) {
  return githubFetch<GitHubPullFile[]>(
    accessToken,
    `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`,
  );
}

export type GitHubPullReview = {
  id: number;
  state: string;
  user: { login: string } | null;
  submitted_at: string | null;
};

export async function listPullRequestReviews(
  accessToken: string,
  owner: string,
  repo: string,
  pullNumber: number,
) {
  return githubFetch<GitHubPullReview[]>(
    accessToken,
    `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews?per_page=100`,
  );
}

export type GitHubPullCommit = {
  sha: string;
  commit: { message: string };
};

export async function listPullRequestCommits(
  accessToken: string,
  owner: string,
  repo: string,
  pullNumber: number,
) {
  return githubFetch<GitHubPullCommit[]>(
    accessToken,
    `/repos/${owner}/${repo}/pulls/${pullNumber}/commits?per_page=100`,
  );
}

export async function getPullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  pullNumber: number,
) {
  return githubFetch<GitHubClosedPull>(
    accessToken,
    `/repos/${owner}/${repo}/pulls/${pullNumber}`,
  );
}

export type GitHubWorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_branch: string;
  head_sha: string;
  created_at: string;
  updated_at: string;
};

export async function listWorkflowRuns(
  accessToken: string,
  owner: string,
  repo: string,
  perPage = 100,
) {
  const data = await githubFetch<{ workflow_runs: GitHubWorkflowRun[] }>(
    accessToken,
    `/repos/${owner}/${repo}/actions/runs?per_page=${perPage}`,
  );
  return data.workflow_runs ?? [];
}

export type GitHubArtifact = {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  archive_download_url: string;
};

/** List Actions artifacts for a workflow run (requires actions:read). */
export async function listWorkflowRunArtifacts(
  accessToken: string,
  owner: string,
  repo: string,
  runId: number,
) {
  const data = await githubFetch<{ artifacts: GitHubArtifact[] }>(
    accessToken,
    `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
  );
  return data.artifacts ?? [];
}

/**
 * Download an artifact zip. Caller parses JUnit XML from the archive.
 * Recommend-only — never uploads or mutates the workflow.
 */
export async function downloadArtifactArchive(
  accessToken: string,
  owner: string,
  repo: string,
  artifactId: number,
): Promise<ArrayBuffer> {
  const path = `/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`;
  let res: Response;
  try {
    res = await httpFetch({
      url: `${GITHUB_API}${path}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      scope: { provider: "github" },
    });
  } catch (err) {
    const status = err instanceof HttpResponseError ? err.status : 502;
    throw new GitHubApiError("artifact download failed", status);
  }
  if (!res.ok) {
    throw new GitHubApiError(`artifact download failed (${res.status})`, res.status);
  }
  return res.arrayBuffer();
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
