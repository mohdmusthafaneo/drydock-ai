import type { IntegrationProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { markIntegrationSync } from "@/lib/integration-health";
import { ingestNormalizedEvents } from "@/lib/telemetry-ingest";
const PROVIDER_MAP: Record<string, IntegrationProvider> = {
  github: "GITHUB",
  jira: "JIRA",
  jenkins: "JENKINS",
  grafana: "GRAFANA",
  prometheus: "PROMETHEUS",
};

export function parseWebhookProvider(slug: string): IntegrationProvider | null {
  return PROVIDER_MAP[slug.toLowerCase()] ?? null;
}

export async function receiveWebhook(input: {
  organizationId: string;
  provider: IntegrationProvider;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const webhook = await prisma.webhookEvent.create({
    data: {
      organizationId: input.organizationId,
      provider: input.provider,
      eventType: input.eventType,
      status: "RECEIVED",
      payloadJson: JSON.stringify(input.payload),
    },
  });

  try {
    const action = String(input.payload.action ?? input.eventType);
    await ingestNormalizedEvents({
      organizationId: input.organizationId,
      userId: "system",
      events: [
        {
          eventType: "webhook",
          source: input.provider.toLowerCase(),
          severity: "info",
          payload: { ...input.payload, webhookEventId: webhook.id },
        },
      ],
    });

    await markIntegrationSync(input.organizationId, input.provider);

    await prisma.webhookEvent.updateMany({
      where: { id: webhook.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });

    await prisma.integration.updateMany({
      where: { organizationId: input.organizationId, provider: input.provider },
      data: { webhookEnabled: true },
    });

    return { webhookId: webhook.id, status: "PROCESSED" as const, action };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    await prisma.webhookEvent.updateMany({
      where: { id: webhook.id },
      data: {
        status: "FAILED",
        retryCount: { increment: 1 },
        lastError: message,
      },
    });
    await markIntegrationSync(input.organizationId, input.provider, message);
    throw err;
  }
}
