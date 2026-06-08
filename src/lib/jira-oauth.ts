import { getAppUrl } from "@/lib/app-url";

const ATLASSIAN_AUTH = "https://auth.atlassian.com";

export type JiraOAuthFlow = "session" | "external";

/** Read-only scopes for connection (PR1) + delivery sync (PR2). Also enable these in the Atlassian developer app. */
export const JIRA_OAUTH_SCOPES = [
  "read:jira-work",
  "read:jira-user",
  "read:project:jira",
  "read:board-scope:jira-software",
  "read:sprint:jira-software",
  "offline_access",
] as const;

export function getJiraOAuthScopeString(): string {
  return JIRA_OAUTH_SCOPES.join(" ");
}

export function getJiraOAuthRedirectUri(flow: JiraOAuthFlow = "session"): string {
  const base = getAppUrl();
  if (flow === "external") {
    return `${base}/api/integrations/external/jira/callback`;
  }
  return `${base}/api/integrations/jira/callback`;
}

export function getJiraOAuthConfig(flow: JiraOAuthFlow = "session") {
  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
  const redirectUri = getJiraOAuthRedirectUri(flow);

  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret),
  };
}

export function buildJiraAuthorizeUrl(state: string, flow: JiraOAuthFlow = "session") {
  const { clientId, redirectUri } = getJiraOAuthConfig(flow);
  if (!clientId) throw new Error("Jira OAuth is not configured");

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: clientId,
    scope: getJiraOAuthScopeString(),
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });

  return `${ATLASSIAN_AUTH}/authorize?${params.toString()}`;
}

export type AtlassianTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>) {
  const { clientId, clientSecret } = getJiraOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Jira OAuth is not configured");
  }

  const res = await fetch(`${ATLASSIAN_AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      ...body,
    }),
  });

  const data = (await res.json()) as AtlassianTokenResponse;

  if (!res.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || "Token exchange failed");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope ?? "",
  };
}

export async function exchangeJiraCode(code: string, flow: JiraOAuthFlow = "session") {
  const { redirectUri } = getJiraOAuthConfig(flow);
  return postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
}

export async function refreshJiraAccessToken(refreshToken: string) {
  return postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export type AtlassianAccessibleResource = {
  id: string;
  url: string;
  name: string;
  scopes?: string[];
  avatarUrl?: string;
};

export async function fetchAccessibleResources(accessToken: string) {
  const res = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch Atlassian accessible resources");
  }

  return res.json() as Promise<AtlassianAccessibleResource[]>;
}

export type JiraMyself = {
  accountId: string;
  displayName: string;
  emailAddress?: string;
};

export async function fetchJiraMyself(accessToken: string, cloudId: string) {
  const res = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    },
  );

  if (!res.ok) {
    throw new Error("Failed to fetch Jira user profile");
  }

  return res.json() as Promise<JiraMyself>;
}
