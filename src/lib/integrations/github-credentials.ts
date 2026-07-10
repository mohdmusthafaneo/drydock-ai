import { prisma } from "@/lib/prisma";
import { getCacheClient } from "@/lib/cache";
import { getInstallationToken, GithubAppError } from "@/lib/github-app-auth";
import { parseIntegrationMeta } from "@/lib/integration-meta";

const INSTALL_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

type CachedOrgGitHubToken = {
  token: string;
  expiresAt: number;
};

function orgCacheKey(organizationId: string): string {
  return `github:org-token:${organizationId}`;
}

export async function getGitHubCredentialToken(
  organizationId: string,
): Promise<string> {
  const cache = getCacheClient();
  const key = orgCacheKey(organizationId);
  const raw = await cache.get(key);
  if (raw) {
    try {
      const cached = JSON.parse(raw) as CachedOrgGitHubToken;
      if (cached.expiresAt > Date.now() && cached.token) {
        return cached.token;
      }
    } catch {
      // fall through
    }
  }

  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider: "GITHUB" },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("GitHub is not connected for this organization");
  }

  const meta = parseIntegrationMeta(integration.metadataJson);
  if (!meta.installationId) {
    throw new Error(
      "GitHub App not installed — install the AIDOS app from Integrations, then sync again.",
    );
  }

  try {
    const token = await getInstallationToken(meta.installationId);
    const expiresAt =
      Date.now() + 55 * 60 * 1000 - INSTALL_TOKEN_REFRESH_BUFFER_MS;
    const ttlSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000));
    await cache.set(
      key,
      JSON.stringify({ token, expiresAt } satisfies CachedOrgGitHubToken),
      ttlSec,
    );
    return token;
  } catch (e) {
    if (e instanceof GithubAppError) {
      if (
        e.message.includes("GITHUB_APP_ID") ||
        e.message.includes("PRIVATE_KEY")
      ) {
        throw new Error(
          "GitHub App credentials missing — set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY in .env",
        );
      }
      throw new Error(
        `GitHub App token failed (${e.status ?? "unknown"}): ${e.message}. Reinstall the app from Integrations.`,
      );
    }
    throw e;
  }
}
