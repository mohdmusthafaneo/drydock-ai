import { prisma } from "@/lib/prisma";
import { httpFetch, HttpResponseError } from "@/lib/http/client";
import { refreshJiraAccessToken } from "@/lib/jira-oauth";
import { mergeJiraMeta, parseJiraMeta } from "@/lib/jira-meta";
import { getJiraAccessToken, getJiraRefreshToken } from "@/lib/jira-tokens";
import { encryptToken } from "@/lib/token-crypto";
import { withCredentialAdvisoryLock } from "@/lib/integrations/advisory-lock";

const JIRA_API = "https://api.atlassian.com/ex/jira";

async function probeJiraToken(
  accessToken: string,
  cloudId: string,
  organizationId: string,
): Promise<boolean> {
  try {
    await httpFetch({
      url: `${JIRA_API}/${cloudId}/rest/api/3/myself`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      scope: { provider: "jira", organizationId },
      maxAttempts: 1,
    });
    return true;
  } catch (err) {
    if (err instanceof HttpResponseError && err.status === 401) return false;
    throw err;
  }
}

async function refreshAndPersistJiraTokens(
  organizationId: string,
  refreshToken: string,
  cloudId: string,
): Promise<string> {
  const refreshed = await refreshJiraAccessToken(refreshToken);
  await httpFetch({
    url: `${JIRA_API}/${cloudId}/rest/api/3/myself`,
    headers: {
      Authorization: `Bearer ${refreshed.accessToken}`,
      Accept: "application/json",
    },
    scope: { provider: "jira", organizationId },
    maxAttempts: 1,
  });

  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "JIRA" },
    },
  });
  if (!integration) {
    throw new Error("Jira integration disappeared during token refresh");
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      metadataJson: mergeJiraMeta(parseJiraMeta(integration.metadataJson), {
        accessTokenEnc: encryptToken(refreshed.accessToken),
        refreshTokenEnc: refreshed.refreshToken
          ? encryptToken(refreshed.refreshToken)
          : parseJiraMeta(integration.metadataJson).refreshTokenEnc,
      }),
      lastError: null,
    },
  });

  return refreshed.accessToken;
}

/**
 * Jira OAuth with rotating refresh tokens — single-flight via Postgres advisory lock.
 */
export async function getJiraCredentialToken(
  organizationId: string,
): Promise<string> {
  return withCredentialAdvisoryLock(organizationId, "JIRA", async () => {
    const integration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "JIRA" },
      },
    });

    if (!integration || integration.status !== "CONNECTED") {
      throw new Error("Jira is not connected for this organization");
    }

    const meta = parseJiraMeta(integration.metadataJson);
    if (!meta.cloudId) {
      throw new Error("Missing cloudId in Jira integration metadata");
    }

    const accessToken = getJiraAccessToken(integration);
    if (!accessToken) {
      throw new Error("Jira token missing — reconnect via OAuth");
    }

    const stillValid = await probeJiraToken(
      accessToken,
      meta.cloudId,
      organizationId,
    );
    if (stillValid) return accessToken;

    const refreshToken = getJiraRefreshToken(integration);
    if (!refreshToken) {
      throw new Error("Jira access token expired — reconnect via OAuth");
    }

    return refreshAndPersistJiraTokens(
      organizationId,
      refreshToken,
      meta.cloudId,
    );
  });
}
