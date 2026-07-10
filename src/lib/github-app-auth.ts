import { SignJWT } from "jose";
import { createPrivateKey, type KeyObject } from "node:crypto";
import { httpFetch, HttpResponseError } from "@/lib/http/client";

const GITHUB_API = "https://api.github.com";
const APP_JWT_MAX_AGE_SECS = 60 * 9;
const INSTALL_TOKEN_TTL_MS = 55 * 60 * 1000;

type CachedInstallationToken = {
  token: string;
  expiresAt: number;
};

const installationTokenCache = new Map<number, CachedInstallationToken>();

export class GithubAppError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
    this.name = "GithubAppError";
  }
}

function getAppId(): number {
  const id = process.env.GITHUB_APP_ID;
  if (!id) throw new GithubAppError("GITHUB_APP_ID is not set");
  const parsed = Number.parseInt(id, 10);
  if (!Number.isFinite(parsed)) throw new GithubAppError("GITHUB_APP_ID must be numeric");
  return parsed;
}

function getPrivateKeyPem(): string {
  const key = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!key) throw new GithubAppError("GITHUB_APP_PRIVATE_KEY is not set");
  return key.replace(/\\n/g, "\n");
}

async function importPrivateKey(pem: string): Promise<KeyObject> {
  return createPrivateKey(pem);
}

/** Short-lived JWT to authenticate as the GitHub App. */
export async function mintAppJWT(): Promise<string> {
  const appId = getAppId();
  const key = await importPrivateKey(getPrivateKeyPem());
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + APP_JWT_MAX_AGE_SECS)
    .setIssuer(String(appId))
    .sign(key);
}

/** Installation access token (cached ~55 min). */
export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = installationTokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const appJwt = await mintAppJWT();
  let res: Response;
  try {
    res = await httpFetch({
      url: `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      scope: { provider: "github-app" },
    });
  } catch (err) {
    const status = err instanceof HttpResponseError ? err.status : undefined;
    const text = err instanceof HttpResponseError ? err.bodyText ?? err.message : String(err);
    throw new GithubAppError(
      text || `Failed to create installation token`,
      status,
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new GithubAppError(
      text || `Failed to create installation token (${res.status})`,
      res.status,
    );
  }

  const data = (await res.json()) as { token: string; expires_at?: string };
  if (!data.token) {
    throw new GithubAppError("Installation token missing from GitHub response");
  }

  const expiresAt = data.expires_at
    ? new Date(data.expires_at).getTime() - 60_000
    : Date.now() + INSTALL_TOKEN_TTL_MS;

  installationTokenCache.set(installationId, {
    token: data.token,
    expiresAt,
  });

  return data.token;
}
