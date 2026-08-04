import { encryptToken } from "@/lib/token-crypto";
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
import { prisma } from "@/lib/prisma";
import { getJiraAccessToken, getJiraRefreshToken } from "@/lib/jira-tokens";
import { providerCredentials } from "@/lib/integrations/provider-credentials";
import { isJiraReconnectError } from "@/lib/jira-errors";
import { JiraApiError } from "@/lib/jira-api/client";
import { formatJiraSyncError } from "@/lib/jira-api/errors";

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

  const accessToken = getJiraAccessToken(integration);
  if (!accessToken) {
    return { ok: false, error: "Missing or invalid access token" };
  }

  try {
    return await probeJiraWithRefresh(integration, accessToken, meta.cloudId, meta.refreshTokenEnc);
  } catch (err) {
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

async function probeJiraWithRefresh(
  integration: Integration,
  accessToken: string,
  cloudId: string,
  fallbackRefreshTokenEnc: string | undefined,
): Promise<{
  ok: boolean;
  error?: string;
  metaPatch?: Partial<JiraIntegrationMeta>;
}> {
  try {
    await fetchJiraMyself(accessToken, cloudId);
    return {
      ok: true,
      metaPatch: {
        lastConnectionCheckAt: new Date().toISOString(),
        connectionStatus: "ok",
        lastError: undefined,
      },
    };
  } catch (err) {
    if (!(err instanceof JiraApiError) || err.status !== 401) throw err;
    const refreshToken = getJiraRefreshToken(integration);
    if (!refreshToken) throw err;
    try {
      const refreshed = await refreshJiraAccessToken(refreshToken);
      await fetchJiraMyself(refreshed.accessToken, cloudId);
      return {
        ok: true,
        metaPatch: {
          accessTokenEnc: encryptToken(refreshed.accessToken),
          refreshTokenEnc: refreshed.refreshToken
            ? encryptToken(refreshed.refreshToken)
            : fallbackRefreshTokenEnc,
          connectionStatus: "ok",
          lastError: undefined,
        },
      };
    } catch (refreshErr) {
      const message = formatJiraSyncError(refreshErr);
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


export function applyJiraMetaPatch(
  integration: Integration,
  patch: Partial<JiraIntegrationMeta>,
): string {
  return mergeJiraMeta(parseJiraMeta(integration.metadataJson), patch);
}

/** Resolve access token via ProviderCredentials; returns cloudId from integration metadata. */
export async function resolveJiraAccessToken(integration: Integration): Promise<{
  accessToken: string;
  cloudId: string;
  metaPatch?: Partial<JiraIntegrationMeta>;
}> {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.cloudId) {
    throw new Error("Missing cloudId in integration metadata");
  }

  const accessToken = await providerCredentials.getAccessToken(
    integration.organizationId,
    "JIRA",
  );

  return { accessToken, cloudId: meta.cloudId };
}

/** Persist sync/auth failure and mark connection unhealthy when OAuth must be renewed. */
export async function recordJiraIntegrationFailure(
  organizationId: string,
  err: unknown,
): Promise<string> {
  const message = formatJiraSyncError(err);
  const markConnectionError = isJiraReconnectError(err);

  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "JIRA" },
    },
  });
  if (!integration) return message;

  await prisma.integration
    .update({
      where: { id: integration.id },
      data: {
        lastError: message,
        ...(markConnectionError
          ? {
              metadataJson: applyJiraMetaPatch(integration, {
                connectionStatus: "error",
                lastError: message,
                lastConnectionCheckAt: new Date().toISOString(),
              }),
            }
          : {}),
      },
    })
    .catch(() => undefined);

  return message;
}
