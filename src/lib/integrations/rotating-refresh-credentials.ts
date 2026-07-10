import type { CredentialProvider } from "@/lib/integrations/credentials";
import { withCredentialAdvisoryLock } from "@/lib/integrations/advisory-lock";

/**
 * GitLab / Bitbucket rotating-refresh placeholder — advisory-lock contract is ready
 * before those integrations ship (architecture §2.1).
 */
export async function getRotatingRefreshCredentialToken(
  organizationId: string,
  provider: Extract<CredentialProvider, "GITLAB" | "BITBUCKET">,
): Promise<string> {
  return withCredentialAdvisoryLock(organizationId, provider, async () => {
    throw new Error(
      `${provider} integration is not available yet — credential refresh contract is reserved`,
    );
  });
}
