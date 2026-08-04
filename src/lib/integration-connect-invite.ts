import { randomBytes } from "crypto";
import type { IntegrationConnectInvite, IntegrationProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/app-url";

const CONNECT_PROVIDERS = new Set<IntegrationProvider>(["GITHUB", "JIRA", "SLACK"]);
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export type ConnectInviteProvider = "GITHUB" | "JIRA" | "SLACK";

export type ConnectInviteErrorCode =
  | "invalid"
  | "expired"
  | "used"
  | "revoked"
  | "already_connected"
  | "provider_mismatch";

export class ConnectInviteError extends Error {
  constructor(public code: ConnectInviteErrorCode) {
    super(code);
    this.name = "ConnectInviteError";
  }
}

function assertConnectProvider(provider: IntegrationProvider): ConnectInviteProvider {
  if (!CONNECT_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported connect invite provider: ${provider}`);
  }
  return provider as ConnectInviteProvider;
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function buildConnectInviteUrl(
  provider: ConnectInviteProvider,
  token: string,
): string {
  const path =
    provider === "GITHUB"
      ? `/connect/github/${token}`
      : provider === "JIRA"
        ? `/connect/jira/${token}`
        : `/connect/slack/${token}`;
  return `${getAppUrl()}${path}`;
}

export async function assertProviderNotConnected(
  organizationId: string,
  provider: IntegrationProvider,
): Promise<void> {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId, provider },
    },
    select: { status: true },
  });

  if (integration?.status === "CONNECTED") {
    throw new ConnectInviteError("already_connected");
  }
}

export async function revokeActiveInvites(
  organizationId: string,
  provider: IntegrationProvider,
  revokedById: string,
): Promise<number> {
  const now = new Date();
  const result = await prisma.integrationConnectInvite.updateMany({
    where: {
      organizationId,
      provider,
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      revokedAt: now,
      revokedById,
    },
  });
  return result.count;
}

export async function createConnectInvite(input: {
  organizationId: string;
  provider: IntegrationProvider;
  createdById: string;
}): Promise<IntegrationConnectInvite & { url: string }> {
  const provider = assertConnectProvider(input.provider);

  await assertProviderNotConnected(input.organizationId, provider);
  await revokeActiveInvites(input.organizationId, provider, input.createdById);

  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const token = generateToken();

  const invite = await prisma.integrationConnectInvite.create({
    data: {
      organizationId: input.organizationId,
      provider,
      token,
      createdById: input.createdById,
      expiresAt,
    },
  });

  return {
    ...invite,
    url: buildConnectInviteUrl(provider, token),
  };
}

export async function getActiveConnectInvite(
  organizationId: string,
  provider: IntegrationProvider,
): Promise<(IntegrationConnectInvite & { url: string }) | null> {
  const p = assertConnectProvider(provider);
  const now = new Date();

  const invite = await prisma.integrationConnectInvite.findFirst({
    where: {
      organizationId,
      provider: p,
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!invite) return null;

  return {
    ...invite,
    url: buildConnectInviteUrl(p, invite.token),
  };
}

export function validateInviteStatus(
  invite: IntegrationConnectInvite,
  expectedProvider?: IntegrationProvider,
): void {
  if (expectedProvider && invite.provider !== expectedProvider) {
    throw new ConnectInviteError("provider_mismatch");
  }
  if (invite.revokedAt) {
    throw new ConnectInviteError("revoked");
  }
  if (invite.usedAt) {
    throw new ConnectInviteError("used");
  }
  if (invite.expiresAt <= new Date()) {
    throw new ConnectInviteError("expired");
  }
}

export async function loadActiveInviteByToken(
  token: string,
  expectedProvider: IntegrationProvider,
): Promise<
  IntegrationConnectInvite & {
    organization: { id: string; name: string };
  }
> {
  const invite = await prisma.integrationConnectInvite.findUnique({
    where: { token },
    include: {
      organization: { select: { id: true, name: true } },
    },
  });

  if (!invite) {
    throw new ConnectInviteError("invalid");
  }

  validateInviteStatus(invite, expectedProvider);
  return invite;
}

export async function loadInviteById(inviteId: string): Promise<IntegrationConnectInvite> {
  const invite = await prisma.integrationConnectInvite.findUnique({
    where: { id: inviteId },
  });

  if (!invite) {
    throw new ConnectInviteError("invalid");
  }

  validateInviteStatus(invite);
  return invite;
}

export async function markInviteUsed(inviteId: string): Promise<void> {
  await prisma.integrationConnectInvite.update({
    where: { id: inviteId },
    data: { usedAt: new Date() },
  });
}

export async function revokeConnectInvite(input: {
  organizationId: string;
  provider?: IntegrationProvider;
  inviteId?: string;
  revokedById: string;
}): Promise<boolean> {
  const now = new Date();

  if (input.inviteId) {
    const invite = await prisma.integrationConnectInvite.findFirst({
      where: {
        id: input.inviteId,
        organizationId: input.organizationId,
        usedAt: null,
        revokedAt: null,
      },
    });
    if (!invite) return false;

    await prisma.integrationConnectInvite.update({
      where: { id: invite.id },
      data: { revokedAt: now, revokedById: input.revokedById },
    });
    return true;
  }

  if (!input.provider) return false;

  const count = await revokeActiveInvites(
    input.organizationId,
    input.provider,
    input.revokedById,
  );
  return count > 0;
}
