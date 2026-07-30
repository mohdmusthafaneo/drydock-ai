import type { Integration } from "@/generated/prisma/client";
import { readJsonField } from "@/lib/json-field";

export type AwsIntegrationMeta = {
  mode?: "aws-assume-role";
  roleArn?: string;
  /** Encrypted ExternalId for STS AssumeRole. */
  externalIdEnc?: string;
  accountIdHint?: string;
  lastScanSummary?: string;
  lastScanAt?: string;
  lastScanRunId?: string;
  connectionStatus?: "ok" | "error";
  lastError?: string;
  connectedBy?: string;
};

const ROLE_ARN_RE = /^arn:aws:iam::\d{12}:role\/[\w+=,.@\-_/]+$/;

export function parseAwsMeta(metadataJson: unknown): AwsIntegrationMeta {
  return readJsonField<AwsIntegrationMeta>(metadataJson, {});
}

export function mergeAwsMeta(
  existing: Partial<AwsIntegrationMeta>,
  patch: Partial<AwsIntegrationMeta>,
): string {
  return JSON.stringify({ ...existing, ...patch });
}

export function isAwsTrulyConnected(
  integration: { status: string; metadataJson: unknown } | undefined,
): boolean {
  if (!integration || integration.status !== "CONNECTED") return false;
  const meta = parseAwsMeta(integration.metadataJson);
  return meta.mode === "aws-assume-role" && Boolean(meta.roleArn && meta.externalIdEnc);
}

export function normalizeRoleArn(raw: string): string {
  const trimmed = raw.trim();
  if (!ROLE_ARN_RE.test(trimmed)) {
    throw new Error(
      "Role ARN must look like arn:aws:iam::123456789012:role/YourRoleName",
    );
  }
  return trimmed;
}

export function accountIdFromRoleArn(roleArn: string): string | null {
  const match = roleArn.match(/^arn:aws:iam::(\d{12}):role\//);
  return match?.[1] ?? null;
}

export function buildAwsConnectMeta(input: {
  existing?: Partial<AwsIntegrationMeta>;
  roleArn: string;
  externalIdEnc: string;
  userId: string;
  connectionStatus?: "ok" | "error";
  lastError?: string;
}): AwsIntegrationMeta {
  return {
    ...input.existing,
    mode: "aws-assume-role",
    roleArn: input.roleArn,
    externalIdEnc: input.externalIdEnc,
    accountIdHint: accountIdFromRoleArn(input.roleArn) ?? input.existing?.accountIdHint,
    connectedBy: input.userId,
    connectionStatus: input.connectionStatus ?? "ok",
    lastError: input.lastError,
    lastScanSummary: input.existing?.lastScanSummary,
    lastScanAt: input.existing?.lastScanAt,
    lastScanRunId: input.existing?.lastScanRunId,
  };
}

export function maskExternalId(externalId: string): string {
  if (externalId.length <= 4) return "••••";
  return `••••${externalId.slice(-4)}`;
}
