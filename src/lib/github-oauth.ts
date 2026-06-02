export { signOAuthState, verifyOAuthState, type OAuthState } from "@/lib/oauth-state";

export function getGitHubOAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/integrations/github/callback`;

  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret),
  };
}

export function buildGitHubAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = getGitHubOAuthConfig();
  if (!clientId) throw new Error("GitHub OAuth is not configured");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user,read:org,repo,workflow",
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGitHubCode(code: string) {
  const { clientId, clientSecret, redirectUri } = getGitHubOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured");
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to exchange GitHub authorization code");
  }

  const data = (await res.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || "No access token");
  }

  return { accessToken: data.access_token, scope: data.scope ?? "" };
}

export async function fetchGitHubUser(accessToken: string) {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch GitHub user profile");
  }

  return res.json() as Promise<{ login: string; id: number; name: string | null }>;
}
