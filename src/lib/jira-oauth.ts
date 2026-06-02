const ATLASSIAN_AUTH = "https://auth.atlassian.com";

export function getJiraOAuthConfig() {
  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/integrations/jira/callback`;

  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret),
  };
}

export function buildJiraAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = getJiraOAuthConfig();
  if (!clientId) throw new Error("Jira OAuth is not configured");

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: clientId,
    scope: "read:jira-work read:jira-user offline_access",
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

export async function exchangeJiraCode(code: string) {
  const { redirectUri } = getJiraOAuthConfig();
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
