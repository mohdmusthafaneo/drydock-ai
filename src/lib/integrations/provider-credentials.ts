import type {
  CredentialProvider,
  ProviderCredentials,
} from "@/lib/integrations/credentials";
import { getGitHubCredentialToken } from "@/lib/integrations/github-credentials";
import { getJiraCredentialToken } from "@/lib/integrations/jira-credentials";
import { getRotatingRefreshCredentialToken } from "@/lib/integrations/rotating-refresh-credentials";

class DefaultProviderCredentials implements ProviderCredentials {
  async getAccessToken(
    organizationId: string,
    provider: CredentialProvider,
  ): Promise<string> {
    switch (provider) {
      case "GITHUB":
        return getGitHubCredentialToken(organizationId);
      case "JIRA":
        return getJiraCredentialToken(organizationId);
      case "GITLAB":
        return getRotatingRefreshCredentialToken(organizationId, "GITLAB");
      case "BITBUCKET":
        return getRotatingRefreshCredentialToken(organizationId, "BITBUCKET");
      default: {
        const exhaustive: never = provider;
        throw new Error(`Unsupported credential provider: ${exhaustive}`);
      }
    }
  }
}

/** Shared credential resolver — mint/cache GitHub; advisory-lock refresh for OAuth providers. */
export const providerCredentials: ProviderCredentials =
  new DefaultProviderCredentials();
