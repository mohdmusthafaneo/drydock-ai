import type { CredentialProvider } from "@/lib/integrations/credentials";
import { withCredentialAdvisoryLock } from "@/lib/integrations/advisory-lock";

/**
 * Bitbucket rotating-refresh placeholder — advisory-lock contract is ready
 * before that integration ships (architecture §2.1). GitLab uses gitlab-credentials.ts.
 */
export async function getRotatingRefreshCredentialToken(
  organizationId: string,
  provider: Extract<CredentialProvider, "BITBUCKET">,
): Promise<string> {
  return withCredentialAdvisoryLock(organizationId, provider, async () => {
    throw new Error(
      `${provider} integration is not available yet — credential refresh contract is reserved`,
    );
  });
}
