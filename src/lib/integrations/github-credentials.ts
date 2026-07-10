import { prisma } from "@/lib/prisma";
import { getInstallationToken, GithubAppError } from "@/lib/github-app-auth";
import { parseIntegrationMeta } from "@/lib/integration-meta";

const INSTALL_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

type CachedOrgGitHubToken = {
  token: string;
  expiresAt: number;
};

const orgTokenCache = new Map<string, CachedOrgGitHubToken>();

export async function getGitHubCredentialToken(
  organizationId: string,
): Promise<string> {
  const cached = orgTokenCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
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
    orgTokenCache.set(organizationId, {
      token,
      expiresAt: Date.now() + 55 * 60 * 1000 - INSTALL_TOKEN_REFRESH_BUFFER_MS,
    });
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
