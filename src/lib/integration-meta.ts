export type GitHubRepoSummary = {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  openPrs?: number;
};

import type { StoredCodeAnalysis } from "@/lib/code-analysis/types";

export type GitHubIntegrationMeta = {
  /** "oauth" | "app" | "dual" — how this integration was connected */
  mode?: string;
  githubLogin?: string;
  githubId?: number;
  scope?: string;
  accessTokenEnc?: string;
  connectedBy?: string;
  /** Org-selected repo full names for sync / code analysis (e.g. neoito/aidos) */
  repoFullNames?: string[];
  /** Cached repo summaries from last sync */
  repos?: GitHubRepoSummary[];
  lastSyncSummary?: string;
  webhookSecretHint?: string;
  /** GitHub App installation id — present when the AIDOS App is installed for the org */
  installationId?: number;
  /** ISO timestamp of the most recent install / re-install */
  installedAt?: string;
  /** User id that completed the App install handshake */
  installedBy?: string;
  connectedVia?: "session" | "external_link";
  externalConnector?: {
    displayName?: string;
    accountId?: string;
    githubInstallationId?: number;
  };
  /** Latest code analysis ingest (commits + PRs for dashboard filtering) */
  codeAnalysisSnapshot?: StoredCodeAnalysis;
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
