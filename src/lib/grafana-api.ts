import type { Integration } from "@/generated/prisma/client";
import { decryptToken } from "@/lib/token-crypto";
import { parseGrafanaMeta, type GrafanaAuthType } from "@/lib/grafana-meta";

export class GrafanaApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type GrafanaAuth = {
  authType: GrafanaAuthType;
  bearerToken?: string;
};

export type GrafanaProbeResult = {
  grafanaUrl: string;
  version?: string;
};

const PROBE_TIMEOUT_MS = 15_000;

export function normalizeGrafanaUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new GrafanaApiError("Invalid Grafana URL", 400);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new GrafanaApiError("Grafana URL must use http or https", 400);
  }
  return trimmed;
}

export function getGrafanaAuth(integration: Integration): GrafanaAuth | null {
  const meta = parseGrafanaMeta(integration.metadataJson);
  if (!meta.authType) return null;

  if (meta.authType === "none") {
    return { authType: "none" };
  }

  if (meta.authType === "bearer") {
    if (!meta.apiTokenEnc) return null;
    try {
      return { authType: "bearer", bearerToken: decryptToken(meta.apiTokenEnc) };
    } catch {
      return null;
    }
  }

  return null;
}

function authHeaders(auth: GrafanaAuth): HeadersInit {
  if (auth.authType === "bearer" && auth.bearerToken) {
    return { Authorization: `Bearer ${auth.bearerToken}` };
  }
  return {};
}

type GrafanaHealthResponse = {
  database?: string;
  version?: string;
};

async function grafanaFetch(
  grafanaUrl: string,
  path: string,
  auth: GrafanaAuth,
): Promise<Response> {
  const url = `${grafanaUrl}${path}`;
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...authHeaders(auth),
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "Grafana probe timed out — check URL and network access"
        : "Unable to reach Grafana — check URL and network access";
    throw new GrafanaApiError(message, 502);
  }
}

async function grafanaFetchJson<T>(
  grafanaUrl: string,
  path: string,
  auth: GrafanaAuth,
): Promise<T> {
  const response = await grafanaFetch(grafanaUrl, path, auth);
  const bodyText = await response.text();

  if (!response.ok) {
    throw new GrafanaApiError(
      response.status === 401 || response.status === 403
        ? "Grafana rejected credentials — check service account token"
        : `Grafana returned HTTP ${response.status}`,
      response.status,
    );
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new GrafanaApiError("Grafana returned an invalid response", 502);
  }
}

export async function probeGrafana(
  grafanaUrl: string,
  auth: GrafanaAuth,
): Promise<GrafanaProbeResult> {
  const normalized = normalizeGrafanaUrl(grafanaUrl);

  try {
    const health = await grafanaFetchJson<GrafanaHealthResponse>(
      normalized,
      "/api/health",
      auth,
    );
    if (health.database === "ok") {
      return { grafanaUrl: normalized, version: health.version };
    }
  } catch (healthErr) {
    if (healthErr instanceof GrafanaApiError && (healthErr.status === 401 || healthErr.status === 403)) {
      throw healthErr;
    }
  }

  try {
    await grafanaFetchJson(normalized, "/api/org", auth);
    return { grafanaUrl: normalized };
  } catch (orgErr) {
    if (orgErr instanceof GrafanaApiError) throw orgErr;
    throw new GrafanaApiError("Grafana probe failed", 502);
  }
}

export function formatGrafanaConnectError(err: unknown): string {
  if (err instanceof GrafanaApiError) {
    if (err.status === 401 || err.status === 403) {
      return "Grafana rejected credentials — check service account token";
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Connection failed";
}
