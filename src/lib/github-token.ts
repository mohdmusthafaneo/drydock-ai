import type { Integration } from "@/generated/prisma/client";
import { getInstallationToken, GithubAppError } from "@/lib/github-app-auth";
import { parseIntegrationMeta } from "@/lib/integration-meta";

/**
 * Resolve a GitHub API bearer token for an org integration.
 * GitHub App installation token only — no OAuth fallback.
 */
export async function resolveGitHubTokenForIntegration(
  integration: Integration,
): Promise<string> {
  const meta = parseIntegrationMeta(integration.metadataJson);

  if (!meta.installationId) {
    throw new Error(
      "GitHub App not installed — install the AIDOS app from Integrations, then sync again.",
    );
  }

  try {
    return await getInstallationToken(meta.installationId);
  } catch (e) {
    if (e instanceof GithubAppError) {
      if (e.message.includes("GITHUB_APP_ID") || e.message.includes("PRIVATE_KEY")) {
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

export function usesGitHubApp(integration: Integration): boolean {
  const meta = parseIntegrationMeta(integration.metadataJson);
  return Boolean(meta.installationId);
}
