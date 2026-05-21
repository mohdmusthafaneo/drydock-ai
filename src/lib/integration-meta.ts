export type GitHubRepoSummary = {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  openPrs?: number;
};

export type GitHubIntegrationMeta = {
  mode?: string;
  githubLogin?: string;
  githubId?: number;
  scope?: string;
  accessTokenEnc?: string;
  connectedBy?: string;
  repos?: GitHubRepoSummary[];
  lastSyncSummary?: string;
  webhookSecretHint?: string;
};

export function parseIntegrationMeta(metadataJson: string): GitHubIntegrationMeta {
  try {
    return JSON.parse(metadataJson) as GitHubIntegrationMeta;
  } catch {
    return {};
  }
}

export function mergeGitHubMeta(
  existing: GitHubIntegrationMeta,
  patch: Partial<GitHubIntegrationMeta>,
): string {
  return JSON.stringify({ ...existing, ...patch });
}
