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
  init?: RequestInit,
): Promise<Response> {
  const url = `${grafanaUrl}${path}`;
  try {
    return await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeaders(auth),
        ...(init?.headers ?? {}),
      },
      body: init?.body,
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

export type GrafanaDatasourceSummary = {
  uid: string;
  name: string;
  type: string;
  isDefault: boolean;
};

type GrafanaDatasourceRecord = {
  uid: string;
  name: string;
  type: string;
  isDefault?: boolean;
};

export async function listGrafanaDatasources(
  grafanaUrl: string,
  auth: GrafanaAuth,
): Promise<GrafanaDatasourceSummary[]> {
  const records = await grafanaFetchJson<GrafanaDatasourceRecord[]>(
    grafanaUrl,
    "/api/datasources",
    auth,
  );
  if (!Array.isArray(records)) return [];
  return records.map((ds) => ({
    uid: ds.uid,
    name: ds.name,
    type: ds.type,
    isDefault: Boolean(ds.isDefault),
  }));
}

export async function listGrafanaPrometheusDatasources(
  grafanaUrl: string,
  auth: GrafanaAuth,
): Promise<GrafanaDatasourceSummary[]> {
  const all = await listGrafanaDatasources(grafanaUrl, auth);
  return all.filter((ds) => ds.type === "prometheus");
}

export async function getGrafanaDatasourceByUid(
  grafanaUrl: string,
  auth: GrafanaAuth,
  uid: string,
): Promise<GrafanaDatasourceSummary | null> {
  try {
    const ds = await grafanaFetchJson<GrafanaDatasourceRecord>(
      grafanaUrl,
      `/api/datasources/uid/${encodeURIComponent(uid)}`,
      auth,
    );
    return {
      uid: ds.uid,
      name: ds.name,
      type: ds.type,
      isDefault: Boolean(ds.isDefault),
    };
  } catch (err) {
    if (err instanceof GrafanaApiError && err.status === 404) return null;
    throw err;
  }
}

type GrafanaDataQueryResponse = {
  results?: Record<
    string,
    {
      status?: number;
      error?: string;
      frames?: Array<{
        schema?: { meta?: { type?: string } };
        data?: { values?: unknown[][] };
      }>;
    }
  >;
};

type PrometheusApiShape = {
  status?: string;
  data?: {
    resultType?: string;
    result?: unknown[];
  };
};

function framesToPrometheusQueryResult(
  frames: NonNullable<GrafanaDataQueryResponse["results"]>[string]["frames"],
): import("@/lib/observability-metrics/types").PrometheusQueryResult {
  if (!frames?.length) {
    return { resultType: "vector", result: [] };
  }

  const frame = frames[0];
  const values = frame?.data?.values;
  if (!values?.length) {
    return { resultType: "vector", result: [] };
  }

  if (values.length >= 2 && Array.isArray(values[0]) && Array.isArray(values[1])) {
    const timestamps = values[0] as number[];
    const dataValues = values[1] as number[];

    if (timestamps.length === 1) {
      return {
        resultType: "vector",
        result: [
          {
            metric: {},
            value: [timestamps[0] / 1000, String(dataValues[0])],
          },
        ],
      };
    }

    return {
      resultType: "matrix",
      result: [
        {
          metric: {},
          values: timestamps.map((ts, i) => [ts / 1000, String(dataValues[i])]),
        },
      ],
    };
  }

  return { resultType: "vector", result: [] };
}

async function grafanaFetchPostJson<T>(
  grafanaUrl: string,
  path: string,
  auth: GrafanaAuth,
  body: unknown,
): Promise<{ response: Response; data: T }> {
  const response = await grafanaFetch(grafanaUrl, path, auth, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const bodyText = await response.text();
  let parsed: T;
  try {
    parsed = JSON.parse(bodyText) as T;
  } catch {
    throw new GrafanaApiError(
      response.ok ? "Grafana returned an invalid response" : `Grafana returned HTTP ${response.status}`,
      response.ok ? 502 : response.status >= 400 ? response.status : 502,
    );
  }
  return { response, data: parsed };
}

export type GrafanaPrometheusQueryResult = {
  result: import("@/lib/observability-metrics/types").PrometheusQueryResult;
  queryPath: "ds-query" | "legacy-proxy";
};

export async function queryPrometheusViaGrafana(input: {
  grafanaUrl: string;
  auth: GrafanaAuth;
  datasourceUid: string;
  promql: string;
  instant?: boolean;
}): Promise<GrafanaPrometheusQueryResult> {
  const instant = input.instant ?? true;

  try {
    const { response, data } = await grafanaFetchPostJson<GrafanaDataQueryResponse>(
      input.grafanaUrl,
      "/api/ds/query",
      input.auth,
      {
        queries: [
          {
            refId: "A",
            datasource: { type: "prometheus", uid: input.datasourceUid },
            expr: input.promql,
            instant,
            range: !instant,
          },
        ],
        from: "now-5m",
        to: "now",
      },
    );

    if (!response.ok) {
      if (response.status === 403) {
        throw new GrafanaApiError(
          "Service account needs datasources:query permission",
          403,
        );
      }
      throw new GrafanaApiError(`Grafana query returned HTTP ${response.status}`, response.status);
    }

    const frameResult = data.results?.A;
    if (frameResult?.error) {
      throw new GrafanaApiError(frameResult.error, 502);
    }

    return {
      result: framesToPrometheusQueryResult(frameResult?.frames),
      queryPath: "ds-query",
    };
  } catch (dsQueryErr) {
    if (
      dsQueryErr instanceof GrafanaApiError &&
      dsQueryErr.status !== 404 &&
      dsQueryErr.status !== 400
    ) {
      throw dsQueryErr;
    }
  }

  const encoded = encodeURIComponent(input.promql);
  const legacyPath = `/api/datasources/proxy/uid/${encodeURIComponent(input.datasourceUid)}/api/v1/query?query=${encoded}`;
  const legacyBody = await grafanaFetchJson<PrometheusApiShape>(
    input.grafanaUrl,
    legacyPath,
    input.auth,
  );

  if (legacyBody.status !== "success") {
    throw new GrafanaApiError("Prometheus query via Grafana proxy failed", 502);
  }

  return {
    result: {
      resultType: (legacyBody.data?.resultType ?? "vector") as import("@/lib/observability-metrics/types").PrometheusQueryResult["resultType"],
      result: (legacyBody.data?.result ?? []) as import("@/lib/observability-metrics/types").PrometheusQueryResult["result"],
    },
    queryPath: "legacy-proxy",
  };
}

export async function probeGrafanaPrometheusDatasource(input: {
  grafanaUrl: string;
  auth: GrafanaAuth;
  datasourceUid: string;
}): Promise<{ summary: string; upCount: number | null }> {
  const { result } = await queryPrometheusViaGrafana({
    grafanaUrl: input.grafanaUrl,
    auth: input.auth,
    datasourceUid: input.datasourceUid,
    promql: "count(up == 1)",
    instant: true,
  });

  const vectors = result.result as import("@/lib/observability-metrics/types").PrometheusQueryVectorResult[];
  const raw = vectors[0]?.value?.[1];
  const upCount = raw != null ? Number.parseFloat(raw) : null;

  if (upCount == null || !Number.isFinite(upCount)) {
    return { summary: "Query OK — no scalar result", upCount: null };
  }

  return {
    summary: `up=${Math.round(upCount)} targets`,
    upCount: Math.round(upCount),
  };
}
