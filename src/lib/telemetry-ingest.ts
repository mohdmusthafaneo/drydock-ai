import { prisma } from "@/lib/prisma";
import { normalizeTelemetryEvent, type RawTelemetryInput } from "@/lib/telemetry-normalizer";
import { ingestTelemetryForOrganization } from "@/lib/telemetry-service";
import { determineActorType } from "@/lib/audit-helpers";
export async function ingestNormalizedEvents(input: {
  organizationId: string;
  userId: string;
  events: RawTelemetryInput[];
}) {
  const created = [];

  for (const raw of input.events) {
    const norm = normalizeTelemetryEvent(raw);
    const event = await prisma.telemetryEvent.create({
      data: {
        organizationId: input.organizationId,
        eventType: norm.eventType,
        source: norm.source,
        severity: norm.severity,
        environment: norm.environment,
        service: norm.service,
        releaseId: norm.releaseId,
        correlationId: norm.correlationId,
        normalizedJson: norm.normalizedJson,
        payloadJson: norm.payloadJson,
        occurredAt: norm.occurredAt,
      },
    });
    created.push(event);
  }

  await prisma.activityEvent.create({
    data: {
      organizationId: input.organizationId,
      type: "telemetry.ingested",
      title: `${created.length} operational event(s) ingested`,
      description: "Normalized telemetry stored in operational data layer",
      metadataJson: JSON.stringify({ count: created.length }),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      action: "telemetry.events.ingested",
      entityType: "TelemetryEvent",
      metadataJson: JSON.stringify({ count: created.length }),
      actorType: determineActorType(input.userId, "telemetry.events.ingested"),
    },
  });

  return created;
}

/** Full collect: synthetic metrics + normalized events (Phase 1 pipeline) */
export async function runTelemetryCollection(input: {
  organizationId: string;
  userId: string;
  releaseId?: string;
  postDeploy?: boolean;
}) {
  const legacy = await ingestTelemetryForOrganization(input);

  const events = legacy.collected.metrics.map((m) => ({
    eventType: "observability",
    source: m.source.toLowerCase(),
    severity: legacy.collected.degradationDetected ? "warning" : "info",
    environment: input.postDeploy ? "production" : "staging",
    service: m.labels?.service as string | undefined,
    releaseId: input.releaseId,
    correlationId: legacy.collected.correlationId,
    payload: { metricKey: m.metricKey, value: m.value, unit: m.unit },
  }));

  const normalized = await ingestNormalizedEvents({
    organizationId: input.organizationId,
    userId: input.userId,
    events,
  });

  return { ...legacy, normalizedEvents: normalized };
}
