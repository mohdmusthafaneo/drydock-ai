import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/token-crypto";
import { withCredentialAdvisoryLock } from "@/lib/integrations/advisory-lock";
import { refreshGitLabAccessToken } from "@/lib/gitlab-oauth";
import {
  getGitLabAccessToken,
  getGitLabRefreshToken,
  mergeGitLabMeta,
  parseGitLabMeta,
} from "@/lib/gitlab-meta";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * GitLab OAuth with rotating refresh tokens — single-flight via Postgres advisory lock.
 * A refresh invalidates the previous refresh token, so concurrent callers must share one refresh.
 */
export async function getGitLabCredentialToken(organizationId: string): Promise<string> {
  return withCredentialAdvisoryLock(organizationId, "GITLAB", async () => {
    const integration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "GITLAB" },
      },
    });

    if (!integration || integration.status !== "CONNECTED") {
      throw new Error("GitLab is not connected for this organization");
    }

    const meta = parseGitLabMeta(integration.metadataJson);
    const accessToken = getGitLabAccessToken(integration);
    if (!accessToken) {
      throw new Error("GitLab token missing — reconnect via OAuth");
    }

    const expiresAt = meta.accessTokenExpiresAt
      ? Date.parse(meta.accessTokenExpiresAt)
      : null;
    const stillValid =
      expiresAt == null || !Number.isFinite(expiresAt) || expiresAt - REFRESH_BUFFER_MS > Date.now();
    if (stillValid) return accessToken;

    const refreshToken = getGitLabRefreshToken(integration);
    if (!refreshToken) {
      throw new Error("GitLab access token expired — reconnect via OAuth");
    }

    const refreshed = await refreshGitLabAccessToken(refreshToken);
    if (!refreshed.refreshToken) {
      throw new Error(
        "GitLab refresh did not return a new refresh token — reconnect GitLab",
      );
    }

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        metadataJson: mergeGitLabMeta(meta, {
          accessTokenEnc: encryptToken(refreshed.accessToken),
          refreshTokenEnc: encryptToken(refreshed.refreshToken),
          accessTokenExpiresAt: refreshed.expiresAt,
          scope: refreshed.scope || meta.scope,
        }),
        lastError: null,
      },
    });

    return refreshed.accessToken;
  });
}
