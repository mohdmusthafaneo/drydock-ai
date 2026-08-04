import type { Integration } from "@/generated/prisma/client";
import { readJsonField } from "@/lib/json-field";

export type SlackIntegrationMeta = {
  mode: "oauth-readonly";
  teamId: string;
  teamName?: string;
  botUserId?: string;
  botTokenEnc: string;
  scope?: string;
  appId?: string;
  enterpriseId?: string;
  isEnterpriseInstall?: boolean;
  connectedBy: string;
  connectedAt: string;
  connectedVia?: "session" | "external_link";
  lastConnectionCheckAt?: string;
  connectionStatus?: "ok" | "error";
  lastError?: string;
  externalConnector?: { displayName?: string; slackUserId?: string };
};

export function parseSlackMeta(metadataJson: unknown): Partial<SlackIntegrationMeta> {
  return readJsonField<Partial<SlackIntegrationMeta>>(metadataJson, {});
}

export function mergeSlackMeta(
  existing: Partial<SlackIntegrationMeta>,
  patch: Partial<SlackIntegrationMeta>,
): string {
  return JSON.stringify({ ...existing, ...patch });
}

export function isSlackTrulyConnected(integration: Integration): boolean {
  if (integration.provider !== "SLACK" || integration.status !== "CONNECTED") {
    return false;
  }
  const meta = parseSlackMeta(integration.metadataJson);
  return Boolean(
    meta.teamId && meta.botTokenEnc && meta.mode === "oauth-readonly",
  );
}
