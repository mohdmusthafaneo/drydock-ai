import type { Integration } from "@/generated/prisma/client";
import { providerCredentials } from "@/lib/integrations/provider-credentials";
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

  return providerCredentials.getAccessToken(integration.organizationId, "GITHUB");
}

export function usesGitHubApp(integration: Integration): boolean {
  const meta = parseIntegrationMeta(integration.metadataJson);
  return Boolean(meta.installationId);
}
