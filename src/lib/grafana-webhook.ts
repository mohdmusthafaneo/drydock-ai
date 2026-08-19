import { timingSafeEqual } from "node:crypto";
import type { MetricSource } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ingestNormalizedEvents } from "@/lib/telemetry-ingest";

export type GrafanaWebhookAlert = {
  fingerprint: string;
  alertname: string;
  severity: string;
  status: "firing" | "resolved";
  service?: string;
  startsAt?: string;
  endsAt?: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
};

const GRAFANA_SOURCE: MetricSource = "GRAFANA";

function correlationIdForFingerprint(fingerprint: string): string {
  return `grafana:${fingerprint}`;
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function normalizeAlertStatus(status: unknown): "firing" | "resolved" {
  const s = String(status ?? "firing").toLowerCase();
  return s === "resolved" ? "resolved" : "firing";
}

function mapRawAlert(raw: unknown): GrafanaWebhookAlert | null {
  if (!raw || typeof raw !== "object") return null;
  const alert = raw as Record<string, unknown>;
  const labels = readStringRecord(alert.labels);
  const annotations = readStringRecord(alert.annotations);
  const fingerprint =
    typeof alert.fingerprint === "string"
      ? alert.fingerprint
      : labels.fingerprint ?? labels.alertname;
  if (!fingerprint) return null;

  return {
    fingerprint,
    alertname: labels.alertname ?? "Grafana alert",
    severity: labels.severity ?? "unknown",
    status: normalizeAlertStatus(alert.status),
    service: labels.service ?? labels.job ?? labels.instance,
    startsAt: typeof alert.startsAt === "string" ? alert.startsAt : undefined,
    endsAt: typeof alert.endsAt === "string" ? alert.endsAt : undefined,
    labels,
    annotations,
  };
}

export function parseGrafanaWebhookPayload(
  payload: Record<string, unknown>,
): GrafanaWebhookAlert[] {
  const rawAlerts = Array.isArray(payload.alerts) ? payload.alerts : [payload];
  const parsed: GrafanaWebhookAlert[] = [];

  for (const raw of rawAlerts) {
    const alert = mapRawAlert(raw);
    if (alert) parsed.push(alert);
  }

  if (parsed.length === 0 && payload.status) {
    const fallback = mapRawAlert({
      status: payload.status,
      labels: payload.commonLabels ?? payload.labels,
      annotations: payload.commonAnnotations ?? payload.annotations,
      fingerprint: payload.groupKey ?? payload.receiver,
    });
    if (fallback) parsed.push(fallback);
  }

  return parsed;
}

export function verifyGrafanaWebhookSecret(
  headerSecret: string | null,
  querySecret: string | null,
  storedSecret: string | undefined,
): boolean {
  if (!storedSecret) {
    return process.env.NODE_ENV !== "production";
  }
  const provided = headerSecret?.trim() || querySecret?.trim();
  if (!provided) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(storedSecret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function grafanaWebhookSeverity(
  alert: GrafanaWebhookAlert,
): "info" | "warning" | "error" | "critical" {
  const sev = alert.severity.toLowerCase();
  if (sev === "critical") return "critical";
  if (sev === "warning" || sev === "warn") return "warning";
  if (alert.status === "resolved") return "info";
  if (sev === "info") return "info";
  return "error";
}

function severityScore(alert: GrafanaWebhookAlert): number {
  const sev = alert.severity.toLowerCase();
  if (sev === "critical") return 90;
  if (sev === "warning" || sev === "warn") return 65;
  if (sev === "info") return 35;
  return 55;
}

async function findMatchingReleaseId(
  organizationId: string,
  alert: GrafanaWebhookAlert,
): Promise<string | null> {
  const releaseName =
    alert.labels.release ??
    alert.labels.releaseName ??
    alert.labels.release_name ??
    alert.annotations.release ??
    alert.annotations.releaseName;

  if (!releaseName) return null;

  const release = await prisma.release.findFirst({
    where: { organizationId, name: releaseName },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return release?.id ?? null;
}

export async function processGrafanaWebhookAlerts(input: {
  organizationId: string;
  alerts: GrafanaWebhookAlert[];
}): Promise<{ created: number; resolved: number; incidentIds: string[] }> {
  let created = 0;
  let resolved = 0;
  const incidentIds: string[] = [];

  for (const alert of input.alerts) {
    const correlationId = correlationIdForFingerprint(alert.fingerprint);
    const existing = await prisma.incident.findFirst({
      where: {
        organizationId: input.organizationId,
        correlationId,
        status: { in: ["OPEN", "INVESTIGATING"] },
      },
    });

    if (alert.status === "firing") {
      if (existing) {
        incidentIds.push(existing.id);
        continue;
      }

      const releaseId = await findMatchingReleaseId(input.organizationId, alert);
      const services = alert.service ? [alert.service] : [];
      const description =
        alert.annotations.summary ??
        alert.annotations.description ??
        `Grafana alert ${alert.alertname} is firing`;

      const incident = await prisma.incident.create({
        data: {
          organizationId: input.organizationId,
          releaseId,
          correlationId,
          source: GRAFANA_SOURCE,
          title: alert.alertname,
          description,
          affectedServicesJson: JSON.stringify(services),
          severityScore: severityScore(alert),
          status: "OPEN",
          detectedAt: alert.startsAt ? new Date(alert.startsAt) : new Date(),
        },
      });
      created += 1;
      incidentIds.push(incident.id);
    } else if (existing) {
      await prisma.incident.update({
        where: { id: existing.id },
        data: {
          status: "CLOSED",
          resolvedAt: alert.endsAt ? new Date(alert.endsAt) : new Date(),
          remediationNotes: `Auto-resolved from Grafana webhook (${alert.alertname})`,
        },
      });
      resolved += 1;
      incidentIds.push(existing.id);
    }
  }

  return { created, resolved, incidentIds };
}

export async function ingestGrafanaWebhookTelemetry(input: {
  organizationId: string;
  alerts: GrafanaWebhookAlert[];
  webhookEventId: string;
}): Promise<void> {
  if (input.alerts.length === 0) return;

  await ingestNormalizedEvents({
    organizationId: input.organizationId,
    userId: "system",
    events: input.alerts.map((alert) => ({
      eventType: "observability",
      source: "grafana",
      severity: grafanaWebhookSeverity(alert),
      service: alert.service,
      correlationId: correlationIdForFingerprint(alert.fingerprint),
      occurredAt: alert.startsAt,
      payload: {
        alertname: alert.alertname,
        fingerprint: alert.fingerprint,
        status: alert.status,
        severity: alert.severity,
        labels: alert.labels,
        annotations: alert.annotations,
        webhookEventId: input.webhookEventId,
      },
    })),
  });
}
