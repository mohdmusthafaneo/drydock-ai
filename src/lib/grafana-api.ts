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

export function formatGrafanaSyncError(err: unknown): string {
  if (err instanceof GrafanaApiError) {
    return err.message;
  }
  return err instanceof Error ? err.message : "Grafana sync failed";
}

export type GrafanaSearchItem = {
  id: number;
  uid: string;
  title: string;
  type: "dash-db" | "dash-folder";
  tags?: string[];
  folderId?: number;
  folderUid?: string;
  folderTitle?: string;
};

type GrafanaDashboardPanel = {
  type?: string;
  panels?: GrafanaDashboardPanel[];
  datasource?: { uid?: string; type?: string } | string | null;
};

type GrafanaDashboardResponse = {
  dashboard?: {
    uid?: string;
    title?: string;
    panels?: GrafanaDashboardPanel[];
  };
  meta?: {
    folderTitle?: string;
    isFolder?: boolean;
  };
};

export type GrafanaAlertmanagerAlert = {
  fingerprint: string;
  labels: Record<string, string>;
  annotations?: Record<string, string>;
  startsAt: string;
  endsAt?: string;
  status?: { state?: string };
};

export type GrafanaAnnotation = {
  id: number;
  time: number;
  timeEnd?: number;
  text: string;
  tags?: string[];
  dashboardUID?: string;
};

export async function searchGrafanaItems(
  grafanaUrl: string,
  auth: GrafanaAuth,
  params: { type: "dash-db" | "dash-folder"; query?: string; folderIds?: number; limit?: number },
): Promise<GrafanaSearchItem[]> {
  const search = new URLSearchParams({
    type: params.type,
    limit: String(params.limit ?? 500),
  });
  if (params.query?.trim()) search.set("query", params.query.trim());
  if (params.folderIds != null) search.set("folderIds", String(params.folderIds));

  const items = await grafanaFetchJson<GrafanaSearchItem[]>(
    grafanaUrl,
    `/api/search?${search.toString()}`,
    auth,
  );
  return Array.isArray(items) ? items : [];
}

export async function getGrafanaDashboard(
  grafanaUrl: string,
  auth: GrafanaAuth,
  uid: string,
): Promise<GrafanaDashboardResponse> {
  return grafanaFetchJson<GrafanaDashboardResponse>(
    grafanaUrl,
    `/api/dashboards/uid/${encodeURIComponent(uid)}`,
    auth,
  );
}

export async function listGrafanaAlerts(
  grafanaUrl: string,
  auth: GrafanaAuth,
): Promise<GrafanaAlertmanagerAlert[]> {
  const alerts = await grafanaFetchJson<GrafanaAlertmanagerAlert[]>(
    grafanaUrl,
    "/api/alertmanager/grafana/api/v2/alerts",
    auth,
  );
  return Array.isArray(alerts) ? alerts : [];
}

export async function listGrafanaAnnotations(
  grafanaUrl: string,
  auth: GrafanaAuth,
  fromMs: number,
  toMs: number,
): Promise<GrafanaAnnotation[]> {
  const search = new URLSearchParams({
    from: String(fromMs),
    to: String(toMs),
    limit: "100",
  });
  const annotations = await grafanaFetchJson<GrafanaAnnotation[]>(
    grafanaUrl,
    `/api/annotations?${search.toString()}`,
    auth,
  );
  return Array.isArray(annotations) ? annotations : [];
}

export function countDashboardPanels(panels: GrafanaDashboardPanel[] | undefined): number {
  if (!panels?.length) return 0;
  let count = 0;
  for (const panel of panels) {
    if (panel.type === "row" && panel.panels?.length) {
      count += countDashboardPanels(panel.panels);
    } else if (panel.type !== "row") {
      count += 1;
    }
  }
  return count;
}

export function dashboardHasMissingDatasource(panels: GrafanaDashboardPanel[] | undefined): boolean {
  if (!panels?.length) return true;

  function checkPanel(panel: GrafanaDashboardPanel): boolean {
    if (panel.type === "row" && panel.panels?.length) {
      return panel.panels.some(checkPanel);
    }
    if (panel.type === "row") return false;

    const ds = panel.datasource;
    if (!ds) return true;
    if (typeof ds === "string") {
      return ds === "-- Mixed --" || ds === "-- Grafana --";
    }
    if (!ds.uid && !ds.type) return true;
    return false;
  }

  return panels.some(checkPanel);
}
