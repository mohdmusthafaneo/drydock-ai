import type { StoredCodeAnalysis } from "@/lib/code-analysis/types";
import { readJsonField } from "@/lib/json-field";

export type GitHubWorkflowRunSummary = {
  name: string;
  conclusion: "success" | "failure" | "cancelled" | null;
  headBranch: string;
  updatedAt: string;
};

export type GitHubRepoSummary = {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  openPrs?: number;
  commonPrLabels?: string[];
  recentWorkflowRuns?: GitHubWorkflowRunSummary[];
};

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
  githubSchemaSnapshot?: {
    syncedAt: string;
    repos: Array<{
      fullName: string;
      defaultBranch: string;
      branches?: string[];
      commonPrLabels?: string[];
    }>;
    suggestions: {
      branchStrategy?: { value: string; reason: string };
      productionBranch?: { value: string; reason: string };
    };
  };
};

export function parseIntegrationMeta(metadataJson: unknown): GitHubIntegrationMeta {
  return readJsonField<GitHubIntegrationMeta>(metadataJson, {});
}

export function mergeGitHubMeta(
  existing: GitHubIntegrationMeta,
  patch: Partial<GitHubIntegrationMeta>,
): string {
  return JSON.stringify({ ...existing, ...patch });
}
