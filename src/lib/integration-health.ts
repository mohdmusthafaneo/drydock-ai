import type { Integration, IntegrationProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isGrafanaTrulyConnected, parseGrafanaMeta } from "@/lib/grafana-meta";
import { isJiraOAuthConnected, parseJiraMeta } from "@/lib/jira-meta";
import { isJiraReconnectMessage, JIRA_RECONNECT_MESSAGE } from "@/lib/jira-errors";

export type IntegrationHealthSummary = {
  provider: IntegrationProvider;
  status: Integration["status"];
  healthy: boolean;
  lastSyncAt: Date | null;
  lastHealthCheckAt: Date | null;
  lastError: string | null;
  webhookEnabled: boolean;
  message: string;
};

export async function checkIntegrationHealth(
  integration: Integration,
): Promise<IntegrationHealthSummary> {
  const now = new Date();
  let healthy = integration.status === "CONNECTED";
  let message = "Connected and syncing";

  if (integration.status === "PENDING") {
    healthy = false;
    message = "Awaiting connection";
  } else if (integration.status === "ERROR") {
    healthy = false;
    message = integration.lastError ?? "Connection error";
  } else if (integration.status === "DISCONNECTED") {
    healthy = false;
    message = "Disconnected";
  } else if (integration.provider === "GRAFANA" && isGrafanaTrulyConnected(integration)) {
    const meta = parseGrafanaMeta(integration.metadataJson);
    if (!meta.dashboardScopes?.length) {
      healthy = false;
      message = "Connected — select dashboards to sync";
    } else if (!integration.lastSyncAt) {
      healthy = false;
      message = "Dashboards selected — run initial sync";
    } else {
      const hoursSince =
        (now.getTime() - integration.lastSyncAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince > 24) {
        healthy = false;
        message = `Last sync ${Math.floor(hoursSince)}h ago — check credentials`;
      } else if (meta.connectionStatus === "error") {
        healthy = false;
        message = meta.lastError ?? "Connection error";
      }
    }
  } else if (integration.provider === "JIRA" && isJiraOAuthConnected(integration)) {
    const meta = parseJiraMeta(integration.metadataJson);
    if (meta.connectionStatus === "error" || (integration.lastError && isJiraReconnectMessage(integration.lastError))) {
      healthy = false;
      const rawError = meta.lastError ?? integration.lastError;
      message =
        rawError && isJiraReconnectMessage(rawError)
          ? JIRA_RECONNECT_MESSAGE
          : (rawError ?? "Reconnect Jira to restore sync");
    } else if (integration.lastSyncAt) {
      const hoursSince =
        (now.getTime() - integration.lastSyncAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince > 24) {
        healthy = false;
        message = `Last sync ${Math.floor(hoursSince)}h ago — check credentials`;
      }
    } else {
      message = "Connected — initial sync pending";
    }
  } else if (integration.lastSyncAt) {
    const hoursSince =
      (now.getTime() - integration.lastSyncAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 24) {
      healthy = false;
      message = `Last sync ${Math.floor(hoursSince)}h ago — check credentials`;
    }
  } else {
    message = "Connected — initial sync pending";
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: { lastHealthCheckAt: now },
  });

  return {
    provider: integration.provider,
    status: integration.status,
    healthy,
    lastSyncAt: integration.lastSyncAt,
    lastHealthCheckAt: now,
    lastError: integration.lastError,
    webhookEnabled: integration.webhookEnabled,
    message,
  };
}

export async function markIntegrationSync(
  organizationId: string,
  provider: Integration["provider"],
  error?: string,
) {
  await prisma.integration.update({
    where: {
      organizationId_provider: { organizationId, provider },
    },
    data: {
      lastSyncAt: error ? undefined : new Date(),
      lastError: error ?? null,
      status: error ? "ERROR" : "CONNECTED",
      lastHealthCheckAt: new Date(),
    },
  });
}
