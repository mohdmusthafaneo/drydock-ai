/**
 * Unified credential resolution for integration providers (architecture §2.1).
 */

export type CredentialProvider = "GITHUB" | "JIRA" | "GITLAB" | "BITBUCKET";

export interface ProviderCredentials {
  /** Returns a valid bearer token, minting or refreshing as needed. */
  getAccessToken(
    organizationId: string,
    provider: CredentialProvider,
  ): Promise<string>;
}
