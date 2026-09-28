import { getAppUrl } from "@/lib/app-url";

/** Read-only scopes: identity, API, and git clone over HTTPS. */
export const GITLAB_OAUTH_SCOPES = ["read_user", "read_api", "read_repository"] as const;

export function getGitLabOAuthScopeString(): string {
  return GITLAB_OAUTH_SCOPES.join(" ");
}

/** GitLab origin used for OAuth and the API. Defaults to GitLab.com. */
export function getGitLabBaseUrl(): string {
  const raw = process.env.GITLAB_BASE_URL?.trim() || "https://gitlab.com";
  const url = new URL(raw);
  return url.origin;
}

export function getGitLabOAuthConfig() {
  const clientId = process.env.GITLAB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITLAB_CLIENT_SECRET?.trim();
  const baseUrl = getGitLabBaseUrl();
  const redirectUri = `${getAppUrl()}/api/integrations/gitlab/callback`;

  return {
    clientId,
    clientSecret,
    baseUrl,
    redirectUri,
    configured: Boolean(clientId && clientSecret),
  };
}

export function buildGitLabAuthorizeUrl(state: string) {
  const { clientId, baseUrl, redirectUri } = getGitLabOAuthConfig();
  if (!clientId) throw new Error("GitLab OAuth is not configured");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope: getGitLabOAuthScopeString(),
  });

  return `${baseUrl}/oauth/authorize?${params.toString()}`;
}

export type GitLabTokenSet = {
  accessToken: string;
  refreshToken?: string;
  scope: string;
  /** ISO expiry. Omitted when the application does not expire access tokens. */
  expiresAt?: string;
};

type GitLabTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<GitLabTokenSet> {
  const { clientId, clientSecret, baseUrl } = getGitLabOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("GitLab OAuth is not configured");
  }

  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      ...body,
    }),
  });

  const data = (await res.json()) as GitLabTokenResponse;
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || "GitLab token exchange failed");
  }

  const expiresAt =
    typeof data.expires_in === "number" && data.expires_in > 0
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope ?? "",
    expiresAt,
  };
}

export async function exchangeGitLabCode(code: string) {
  const { redirectUri } = getGitLabOAuthConfig();
  return postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
}

export async function refreshGitLabAccessToken(refreshToken: string) {
  const { redirectUri } = getGitLabOAuthConfig();
  return postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: redirectUri,
  });
}
