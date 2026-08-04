import type { Integration, IntegrationProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isGrafanaTrulyConnected, parseGrafanaMeta } from "@/lib/grafana-meta";
import { isJiraOAuthConnected, parseJiraMeta } from "@/lib/jira-meta";
import { isSlackTrulyConnected, parseSlackMeta } from "@/lib/slack-meta";
import { isJiraReconnectMessage, JIRA_RECONNECT_MESSAGE } from "@/lib/jira-errors";

export type IntegrationHealthState =
  | "healthy"
  | "degraded"
  | "expired"
  | "disconnected"
  | "pending";

export type IntegrationHealthSummary = {
  provider: IntegrationProvider;
  status: Integration["status"];
  state: IntegrationHealthState;
  healthy: boolean;
  lastSyncAt: Date | null;
  lastHealthCheckAt: Date | null;
  lastError: string | null;
  webhookEnabled: boolean;
  message: string;
};

/** Lightweight Phase-1 health gate (no DB write). Phase 1.5 Jira work may refine. */
export function isIntegrationHealthyLite(
  integration: Pick<Integration, "status" | "lastError">,
): boolean {
  return integration.status === "CONNECTED" && !integration.lastError;
}

function resolveHealthState(input: {
  status: Integration["status"];
  healthy: boolean;
  expired: boolean;
}): IntegrationHealthState {
  if (input.status === "PENDING") return "pending";
  if (input.status === "DISCONNECTED") return "disconnected";
  if (input.expired) return "expired";
  if (input.healthy) return "healthy";
  return "degraded";
}

export async function checkIntegrationHealth(
  integration: Integration,
): Promise<IntegrationHealthSummary> {
  const now = new Date();
  let healthy = integration.status === "CONNECTED";
  let message = "Connected and syncing";
  let expired = false;

  if (integration.status === "PENDING") {
    healthy = false;
    message = "Awaiting connection";
  } else if (integration.status === "ERROR") {
    healthy = false;
    message = integration.lastError ?? "Connection error";
    if (integration.lastError && isJiraReconnectMessage(integration.lastError)) {
      expired = true;
    }
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
      const reconnect =
        (rawError && isJiraReconnectMessage(rawError)) ||
        (integration.lastError != null && isJiraReconnectMessage(integration.lastError));
      if (reconnect) expired = true;
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
  } else if (integration.provider === "SLACK" && isSlackTrulyConnected(integration)) {
    const meta = parseSlackMeta(integration.metadataJson);
    const requiredScopes = [
      "app_mentions:read",
      "chat:write",
      "users:read",
      "users:read.email",
    ];
    const granted = new Set(
      (meta.scope ?? "")
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const missing = requiredScopes.filter((s) => granted.size > 0 && !granted.has(s));

    if (meta.connectionStatus === "error" || !meta.botTokenEnc) {
      healthy = false;
      expired = true;
      message =
        meta.lastError ??
        integration.lastError ??
        "Reconnect Slack to restore the assistant";
    } else if (missing.length > 0) {
      healthy = false;
      message = `Missing Slack scopes: ${missing.join(", ")} — reinstall the app`;
    } else {
      message = meta.teamName
        ? `Connected to ${meta.teamName}`
        : "Connected — Slack assistant ready";
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

  const state = resolveHealthState({
    status: integration.status,
    healthy,
    expired,
  });

  return {
    provider: integration.provider,
    status: integration.status,
    state,
    healthy,
    lastSyncAt: integration.lastSyncAt,
    lastHealthCheckAt: now,
    lastError: integration.lastError,
    webhookEnabled: integration.webhookEnabled,
    message,
  };
}

export type IntegrationHealthAggregate = {
  total: number;
  healthy: number;
  degraded: number;
  disconnected: number;
  headline: string;
  verdict: "good" | "attention" | "risk";
  firstUnhealthyProvider: IntegrationProvider | null;
};

export function summarizeIntegrationHealth(
  summaries: IntegrationHealthSummary[],
): IntegrationHealthAggregate {
  if (summaries.length === 0) {
    return {
      total: 0,
      healthy: 0,
      degraded: 0,
      disconnected: 0,
      headline: "No integrations configured yet",
      verdict: "attention",
      firstUnhealthyProvider: null,
    };
  }

  const healthy = summaries.filter((s) => s.healthy).length;
  const disconnected = summaries.filter((s) => s.status === "DISCONNECTED").length;
  const degraded = summaries.length - healthy - disconnected;

  const firstUnhealthy = summaries.find((s) => !s.healthy) ?? null;

  let verdict: IntegrationHealthAggregate["verdict"] = "good";
  let headline: string;

  if (healthy === summaries.length) {
    headline = `All ${summaries.length} integrations healthy`;
  } else if (disconnected > 0 && healthy === 0) {
    verdict = "risk";
    headline = `${disconnected} of ${summaries.length} integrations disconnected`;
  } else if (degraded > 0 || disconnected > 0) {
    verdict = "attention";
    headline = `${healthy} of ${summaries.length} integrations healthy`;
  } else {
    headline = `${healthy} of ${summaries.length} integrations healthy`;
  }

  return {
    total: summaries.length,
    healthy,
    degraded,
    disconnected,
    headline,
    verdict,
    firstUnhealthyProvider: firstUnhealthy?.provider ?? null,
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
