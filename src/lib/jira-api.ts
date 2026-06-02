import { decryptToken, encryptToken } from "@/lib/token-crypto";
import {
  fetchJiraMyself,
  refreshJiraAccessToken,
  type AtlassianAccessibleResource,
} from "@/lib/jira-oauth";
import {
  mergeJiraMeta,
  parseJiraMeta,
  type JiraIntegrationMeta,
  type JiraSiteSummary,
} from "@/lib/jira-meta";
import type { Integration } from "@/generated/prisma/client";

export class JiraApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function getJiraAccessToken(integration: Integration): string | null {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.accessTokenEnc) return null;
  try {
    return decryptToken(meta.accessTokenEnc);
  } catch {
    return null;
  }
}

export function getJiraRefreshToken(integration: Integration): string | null {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.refreshTokenEnc) return null;
  try {
    return decryptToken(meta.refreshTokenEnc);
  } catch {
    return null;
  }
}

function siteFromResource(resource: AtlassianAccessibleResource): JiraSiteSummary {
  return {
    cloudId: resource.id,
    siteUrl: resource.url.replace(/\/$/, ""),
    siteName: resource.name,
  };
}

export function buildJiraOAuthMeta(input: {
  existing?: Partial<JiraIntegrationMeta>;
  accessToken: string;
  refreshToken?: string;
  scope: string;
  userId: string;
  resources: AtlassianAccessibleResource[];
  myself?: { accountId: string; displayName: string };
}): JiraIntegrationMeta {
  const availableSites = input.resources.map(siteFromResource);
  const primary = availableSites[0];
  if (!primary) {
    throw new Error("No accessible Jira Cloud sites for this account");
  }

  return {
    ...input.existing,
    mode: "oauth-readonly",
    cloudId: primary.cloudId,
    siteUrl: primary.siteUrl,
    siteName: primary.siteName,
    accountId: input.myself?.accountId,
    displayName: input.myself?.displayName,
    scopes: input.scope,
    accessTokenEnc: encryptToken(input.accessToken),
    refreshTokenEnc: input.refreshToken ? encryptToken(input.refreshToken) : undefined,
    connectedBy: input.userId,
    availableSites: availableSites.length > 1 ? availableSites : undefined,
    lastConnectionCheckAt: new Date().toISOString(),
    connectionStatus: "ok",
    lastError: undefined,
  };
}

/** Verify the stored connection by calling Jira /myself (PR1 probe). */
export async function probeJiraConnection(integration: Integration): Promise<{
  ok: boolean;
  error?: string;
  metaPatch?: Partial<JiraIntegrationMeta>;
}> {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.cloudId) {
    return { ok: false, error: "Missing cloudId in integration metadata" };
  }

  let accessToken = getJiraAccessToken(integration);
  if (!accessToken) {
    return { ok: false, error: "Missing or invalid access token" };
  }

  try {
    await fetchJiraMyself(accessToken, meta.cloudId);
    return {
      ok: true,
      metaPatch: {
        lastConnectionCheckAt: new Date().toISOString(),
        connectionStatus: "ok",
        lastError: undefined,
      },
    };
  } catch (err) {
    if (err instanceof JiraApiError && err.status === 401) {
      const refreshToken = getJiraRefreshToken(integration);
      if (refreshToken) {
        try {
          const refreshed = await refreshJiraAccessToken(refreshToken);
          accessToken = refreshed.accessToken;
          await fetchJiraMyself(accessToken, meta.cloudId);
          return {
            ok: true,
            metaPatch: {
              accessTokenEnc: encryptToken(refreshed.accessToken),
              refreshTokenEnc: refreshed.refreshToken
                ? encryptToken(refreshed.refreshToken)
                : meta.refreshTokenEnc,
              lastConnectionCheckAt: new Date().toISOString(),
              connectionStatus: "ok",
              lastError: undefined,
            },
          };
        } catch (refreshErr) {
          const message =
            refreshErr instanceof Error ? refreshErr.message : "Token refresh failed";
          return {
            ok: false,
            error: message,
            metaPatch: {
              lastConnectionCheckAt: new Date().toISOString(),
              connectionStatus: "error",
              lastError: message,
            },
          };
        }
      }
    }

    const message = err instanceof Error ? err.message : "Connection probe failed";
    return {
      ok: false,
      error: message,
      metaPatch: {
        lastConnectionCheckAt: new Date().toISOString(),
        connectionStatus: "error",
        lastError: message,
      },
    };
  }
}

export function applyJiraMetaPatch(
  integration: Integration,
  patch: Partial<JiraIntegrationMeta>,
): string {
  return mergeJiraMeta(parseJiraMeta(integration.metadataJson), patch);
}
