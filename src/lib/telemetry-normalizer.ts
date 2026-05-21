import type {
  TelemetryEventType,
  TelemetrySeverity,
  MetricSource,
} from "@/generated/prisma/client";

export type RawTelemetryInput = {
  eventType?: string;
  source?: string;
  severity?: string;
  environment?: string;
  service?: string;
  releaseId?: string;
  correlationId?: string;
  occurredAt?: string | Date;
  payload?: Record<string, unknown>;
};

const EVENT_TYPE_MAP: Record<string, TelemetryEventType> = {
  deployment: "DEPLOYMENT",
  deploy: "DEPLOYMENT",
  cicd: "CICD",
  pipeline: "CICD",
  release: "RELEASE",
  observability: "OBSERVABILITY",
  metric: "OBSERVABILITY",
  trace: "OBSERVABILITY",
  log: "OBSERVABILITY",
  ai_runtime: "AI_RUNTIME",
  webhook: "WEBHOOK",
};

const SEVERITY_MAP: Record<string, TelemetrySeverity> = {
  info: "INFO",
  warning: "WARNING",
  warn: "WARNING",
  error: "ERROR",
  critical: "CRITICAL",
};

export function normalizeTelemetryEvent(raw: RawTelemetryInput) {
  const key = (raw.eventType ?? "custom").toLowerCase().replace(/-/g, "_");
  const eventType = EVENT_TYPE_MAP[key] ?? "CUSTOM";
  const sevKey = (raw.severity ?? "info").toLowerCase();
  const severity = SEVERITY_MAP[sevKey] ?? "INFO";
  const occurredAt = raw.occurredAt ? new Date(raw.occurredAt) : new Date();

  const normalized = {
    eventType,
    source: raw.source ?? "unknown",
    severity,
    environment: raw.environment ?? null,
    service: raw.service ?? null,
    releaseId: raw.releaseId ?? null,
    correlationId: raw.correlationId ?? `corr_${Date.now()}`,
    occurredAt,
    labels: {
      environment: raw.environment,
      service: raw.service,
    },
  };

  return {
    ...normalized,
    normalizedJson: JSON.stringify(normalized),
    payloadJson: JSON.stringify(raw.payload ?? {}),
  };
}

export function metricSourceFromProvider(provider: string): MetricSource {
  const p = provider.toUpperCase();
  if (p === "PROMETHEUS") return "PROMETHEUS";
  if (p === "GRAFANA") return "GRAFANA";
  if (p === "OPENTELEMETRY" || p === "OTEL") return "OPENTELEMETRY";
  return "SYNTHETIC";
}
