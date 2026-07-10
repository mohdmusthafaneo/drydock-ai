import type { Integration } from "@/generated/prisma/client";
import { decryptToken } from "@/lib/token-crypto";
import { httpFetch, HttpResponseError } from "@/lib/http/client";
import {
  parsePrometheusMeta,
  type PrometheusAuthType,
} from "@/lib/prometheus-meta";

export class PrometheusApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type PrometheusAuth = {
  authType: PrometheusAuthType;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
};

export type PrometheusProbeResult = {
  version?: string;
  prometheusUrl: string;
};

const PROBE_TIMEOUT_MS = 15_000;

export function normalizePrometheusUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PrometheusApiError("Invalid Prometheus URL", 400);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new PrometheusApiError("Prometheus URL must use http or https", 400);
  }
  return trimmed;
}

export function getPrometheusAuth(integration: Integration): PrometheusAuth | null {
  const meta = parsePrometheusMeta(integration.metadataJson);
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

  if (meta.authType === "basic") {
    if (!meta.basicUsername || !meta.basicPasswordEnc) return null;
    try {
      return {
        authType: "basic",
        basicUsername: meta.basicUsername,
        basicPassword: decryptToken(meta.basicPasswordEnc),
      };
    } catch {
      return null;
    }
  }

  return null;
}

function authHeaders(auth: PrometheusAuth): HeadersInit {
  if (auth.authType === "bearer" && auth.bearerToken) {
    return { Authorization: `Bearer ${auth.bearerToken}` };
  }
  if (auth.authType === "basic" && auth.basicUsername && auth.basicPassword) {
    const encoded = Buffer.from(`${auth.basicUsername}:${auth.basicPassword}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}

type PrometheusApiResponse = {
  status?: string;
  error?: string;
  errorType?: string;
  data?: {
    resultType?: string;
    result?: unknown[];
  };
};

export type PrometheusQueryVectorResult = {
  metric: Record<string, string>;
  value: [number, string];
};

export type PrometheusQueryMatrixResult = {
  metric: Record<string, string>;
  values: Array<[number, string]>;
};

export type PrometheusQueryResult = {
  resultType: "vector" | "matrix" | "scalar" | "string";
  result: PrometheusQueryVectorResult[] | PrometheusQueryMatrixResult[];
  scalarValue?: number;
};

function mapPrometheusApiResponse(body: PrometheusApiResponse): PrometheusQueryResult {
  const resultType = (body.data?.resultType ?? "vector") as PrometheusQueryResult["resultType"];
  const result = (body.data?.result ?? []) as PrometheusQueryResult["result"];

  if (resultType === "scalar" && Array.isArray(result) && result.length >= 2) {
    const scalarValue = Number.parseFloat(String(result[1]));
    return {
      resultType: "scalar",
      result: [],
      scalarValue: Number.isFinite(scalarValue) ? scalarValue : undefined,
    };
  }

  return { resultType, result };
}

async function prometheusFetch(
  prometheusUrl: string,
  path: string,
  auth: PrometheusAuth,
  organizationId?: string,
): Promise<PrometheusApiResponse> {
  const url = `${prometheusUrl}${path}`;
  let response: Response;
  try {
    response = await httpFetch({
      url,
      method: "GET",
      headers: {
        Accept: "application/json",
        ...authHeaders(auth),
      },
      timeoutMs: PROBE_TIMEOUT_MS,
      scope: { provider: "prometheus", organizationId },
    });
  } catch (err) {
    const message =
      err instanceof HttpResponseError && err.message.includes("timed out")
        ? "Prometheus probe timed out — check URL and network access"
        : "Unable to reach Prometheus — check URL and network access";
    throw new PrometheusApiError(message, 502);
  }

  const bodyText = await response.text();
  let body: PrometheusApiResponse;
  try {
    body = JSON.parse(bodyText) as PrometheusApiResponse;
  } catch {
    throw new PrometheusApiError(
      response.ok
        ? "Prometheus returned an invalid response"
        : `Prometheus returned HTTP ${response.status}`,
      response.ok ? 502 : response.status >= 400 ? response.status : 502,
    );
  }

  if (!response.ok) {
    throw new PrometheusApiError(
      body.error ?? `Prometheus returned HTTP ${response.status}`,
      response.status,
    );
  }

  if (body.status !== "success") {
    throw new PrometheusApiError(
      body.error ?? "Prometheus query failed",
      502,
    );
  }

  return body;
}

export async function queryPrometheusInstant(
  prometheusUrl: string,
  auth: PrometheusAuth,
  promql: string,
): Promise<PrometheusQueryResult> {
  const encoded = encodeURIComponent(promql);
  const body = await prometheusFetch(
    prometheusUrl,
    `/api/v1/query?query=${encoded}`,
    auth,
  );
  return mapPrometheusApiResponse(body);
}

export async function queryPrometheusRange(
  prometheusUrl: string,
  auth: PrometheusAuth,
  promql: string,
  start: Date,
  end: Date,
  stepSec: number,
): Promise<PrometheusQueryResult> {
  const params = new URLSearchParams({
    query: promql,
    start: String(start.getTime() / 1000),
    end: String(end.getTime() / 1000),
    step: String(stepSec),
  });
  const body = await prometheusFetch(
    prometheusUrl,
    `/api/v1/query_range?${params.toString()}`,
    auth,
  );
  return mapPrometheusApiResponse(body);
}

export function createDirectPrometheusTransport(input: {
  prometheusUrl: string;
  auth: PrometheusAuth;
}): import("@/lib/observability-metrics/types").MetricsQueryTransport {
  return {
    kind: "prometheus-direct",
    queryInstant: (promql) => queryPrometheusInstant(input.prometheusUrl, input.auth, promql),
    queryRange: (promql, start, end, stepSec) =>
      queryPrometheusRange(input.prometheusUrl, input.auth, promql, start, end, stepSec),
  };
}

export async function probePrometheus(
  prometheusUrl: string,
  auth: PrometheusAuth,
): Promise<PrometheusProbeResult> {
  const normalized = normalizePrometheusUrl(prometheusUrl);

  try {
    await prometheusFetch(normalized, "/api/v1/query?query=up", auth);
    return { prometheusUrl: normalized };
  } catch (queryErr) {
    if (!(queryErr instanceof PrometheusApiError) || queryErr.status === 401 || queryErr.status === 403) {
      throw queryErr;
    }
  }

  try {
    await prometheusFetch(normalized, "/api/v1/status/runtimeinfo", auth);
    return { prometheusUrl: normalized };
  } catch (statusErr) {
    if (statusErr instanceof PrometheusApiError) throw statusErr;
    throw new PrometheusApiError("Prometheus probe failed", 502);
  }
}

export function formatPrometheusConnectError(err: unknown): string {
  if (err instanceof PrometheusApiError) {
    if (err.status === 401 || err.status === 403) {
      return "Prometheus rejected credentials — check token or basic auth";
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Connection failed";
}
