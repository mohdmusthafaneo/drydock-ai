import type { Integration } from "@/generated/prisma/client";
import { readJsonField } from "@/lib/json-field";
import { decryptToken } from "@/lib/token-crypto";

export type GitLabIntegrationMeta = {
  mode?: "oauth";
  /** Origin only, e.g. https://gitlab.com */
  baseUrl?: string;
  username?: string;
  gitlabUserId?: number;
  name?: string | null;
  scope?: string;
  accessTokenEnc?: string;
  refreshTokenEnc?: string;
  /** ISO time when the access token expires. Absent when the app does not expire tokens. */
  accessTokenExpiresAt?: string;
  connectedBy?: string;
};

export function parseGitLabMeta(metadataJson: unknown): GitLabIntegrationMeta {
  return readJsonField<GitLabIntegrationMeta>(metadataJson, {});
}

export function mergeGitLabMeta(
  existing: Partial<GitLabIntegrationMeta>,
  patch: Partial<GitLabIntegrationMeta>,
): string {
  return JSON.stringify({ ...existing, ...patch });
}

export function getGitLabAccessToken(integration: Integration): string | null {
  const meta = parseGitLabMeta(integration.metadataJson);
  if (!meta.accessTokenEnc) return null;
  try {
    return decryptToken(meta.accessTokenEnc);
  } catch {
    return null;
  }
}

export function getGitLabRefreshToken(integration: Integration): string | null {
  const meta = parseGitLabMeta(integration.metadataJson);
  if (!meta.refreshTokenEnc) return null;
  try {
    return decryptToken(meta.refreshTokenEnc);
  } catch {
    return null;
  }
}
