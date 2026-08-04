import { getAppUrl } from "@/lib/app-url";

const SLACK_AUTHORIZE = "https://slack.com/oauth/v2/authorize";
const SLACK_OAUTH_ACCESS = "https://slack.com/api/oauth.v2.access";

export type SlackOAuthFlow = "session" | "external";

/**
 * Read-oriented bot scopes for multi-tenant Q&A.
 * `chat:write` / `im:write` are required to reply; no write scopes into customer systems.
 */
export const SLACK_BOT_SCOPES = [
  "app_mentions:read",
  "chat:write",
  "im:history",
  "im:read",
  "im:write",
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "users:read",
  "users:read.email",
  "assistant:write",
] as const;

export function getSlackOAuthScopeString(): string {
  return SLACK_BOT_SCOPES.join(",");
}

export function getSlackOAuthRedirectUri(flow: SlackOAuthFlow = "session"): string {
  const base = getAppUrl();
  if (flow === "external") {
    return `${base}/api/integrations/external/slack/callback`;
  }
  return `${base}/api/integrations/slack/callback`;
}

export function getSlackOAuthConfig(flow: SlackOAuthFlow = "session") {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const configured = Boolean(clientId && clientSecret && signingSecret);
  // Only resolve the app URL when Slack is configured — avoids throwing
  // during Next.js production builds (DOCKER/CI) where NEXT_PUBLIC_APP_URL
  // is unset but agent modules are still imported for page data collection.
  const redirectUri = configured ? getSlackOAuthRedirectUri(flow) : "";

  return {
    clientId,
    clientSecret,
    signingSecret,
    redirectUri,
    configured,
  };
}

export function buildSlackAuthorizeUrl(state: string, flow: SlackOAuthFlow = "session") {
  const { clientId, redirectUri } = getSlackOAuthConfig(flow);
  if (!clientId) throw new Error("Slack OAuth is not configured");

  const params = new URLSearchParams({
    client_id: clientId,
    scope: getSlackOAuthScopeString(),
    redirect_uri: redirectUri,
    state,
  });

  return `${SLACK_AUTHORIZE}?${params.toString()}`;
}

export type SlackOAuthV2AccessResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: { id: string; name?: string };
  enterprise?: { id: string; name?: string } | null;
  is_enterprise_install?: boolean;
  authed_user?: { id: string };
};

export type SlackTokenExchangeResult = {
  botToken: string;
  botUserId?: string;
  teamId: string;
  teamName?: string;
  enterpriseId?: string;
  isEnterpriseInstall: boolean;
  scope: string;
  appId?: string;
  authedUserId?: string;
};

export async function exchangeSlackCode(
  code: string,
  flow: SlackOAuthFlow = "session",
): Promise<SlackTokenExchangeResult> {
  const { clientId, clientSecret, redirectUri } = getSlackOAuthConfig(flow);
  if (!clientId || !clientSecret) {
    throw new Error("Slack OAuth is not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(SLACK_OAUTH_ACCESS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as SlackOAuthV2AccessResponse;

  if (!res.ok || !data.ok || !data.access_token) {
    throw new Error(data.error || "Slack token exchange failed");
  }

  const isEnterpriseInstall = Boolean(data.is_enterprise_install);
  const teamId = isEnterpriseInstall
    ? (data.enterprise?.id ?? data.team?.id)
    : data.team?.id;

  if (!teamId) {
    throw new Error("Slack OAuth response missing team/enterprise id");
  }

  return {
    botToken: data.access_token,
    botUserId: data.bot_user_id,
    teamId,
    teamName: data.team?.name ?? data.enterprise?.name,
    enterpriseId: data.enterprise?.id ?? undefined,
    isEnterpriseInstall,
    scope: data.scope ?? "",
    appId: data.app_id,
    authedUserId: data.authed_user?.id,
  };
}

export type SlackAuthTestResult = {
  ok: boolean;
  error?: string;
  user_id?: string;
  team?: string;
  team_id?: string;
  bot_id?: string;
};

/** Lightweight health probe against auth.test. */
export async function slackAuthTest(botToken: string): Promise<SlackAuthTestResult> {
  const res = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  return (await res.json()) as SlackAuthTestResult;
}

export type SlackUserProfile = {
  id: string;
  name?: string;
  real_name?: string;
  profile?: {
    email?: string;
    display_name?: string;
    real_name?: string;
  };
};

export async function fetchSlackUser(
  botToken: string,
  slackUserId: string,
): Promise<SlackUserProfile | null> {
  const params = new URLSearchParams({ user: slackUserId });
  const res = await fetch(`https://slack.com/api/users.info?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${botToken}`,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    user?: SlackUserProfile;
  };

  if (!data.ok || !data.user) return null;
  return data.user;
}
