export type GitHubRepoSummary = {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  openPrs?: number;
};

export type GitHubIntegrationMeta = {
  /** "oauth" | "app" | "dual" — how this integration was connected */
  mode?: string;
  githubLogin?: string;
  githubId?: number;
  scope?: string;
  accessTokenEnc?: string;
  connectedBy?: string;
  repos?: GitHubRepoSummary[];
  lastSyncSummary?: string;
  webhookSecretHint?: string;
  /** GitHub App installation id — present when the AIDOS App is installed for the org */
  installationId?: number;
  /** ISO timestamp of the most recent install / re-install */
  installedAt?: string;
  /** User id that completed the install handshake */
  installedBy?: string;
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
