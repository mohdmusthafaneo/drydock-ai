import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/token-crypto";
import { isSlackTrulyConnected, parseSlackMeta } from "@/lib/slack-meta";

export type SlackTenantResolution = {
  organizationId: string;
  integrationId: string;
  teamId: string;
  botToken: string;
  botUserId?: string;
  teamName?: string;
};

type CacheEntry = {
  value: SlackTenantResolution | null;
  expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/**
 * Resolve a Slack team_id (or enterprise_id for org-wide installs) to an AIDOS
 * organization. Unknown teams return null — never guess across tenants.
 */
export async function resolveSlackTenant(
  teamId: string,
): Promise<SlackTenantResolution | null> {
  if (!teamId) return null;

  const cached = cache.get(teamId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const integrations = await prisma.integration.findMany({
    where: {
      provider: "SLACK",
      status: "CONNECTED",
    },
  });

  let match: SlackTenantResolution | null = null;
  for (const integration of integrations) {
    if (!isSlackTrulyConnected(integration)) continue;
    const meta = parseSlackMeta(integration.metadataJson);
    if (!meta.teamId || !meta.botTokenEnc) continue;
    if (meta.teamId !== teamId && meta.enterpriseId !== teamId) continue;

    try {
      match = {
        organizationId: integration.organizationId,
        integrationId: integration.id,
        teamId: meta.teamId,
        botToken: decryptToken(meta.botTokenEnc),
        botUserId: meta.botUserId,
        teamName: meta.teamName,
      };
    } catch {
      match = null;
    }
    break;
  }

  cache.set(teamId, { value: match, expiresAt: Date.now() + CACHE_TTL_MS });
  return match;
}

export function invalidateSlackTenantCache(teamId?: string) {
  if (teamId) {
    cache.delete(teamId);
    return;
  }
  cache.clear();
}

/** Lookup used by Chat SDK installationProvider. */
export async function getSlackInstallationForAdapter(
  installationId: string,
  _isEnterpriseInstall: boolean,
): Promise<{
  botToken: string;
  botUserId?: string;
  teamName?: string;
  enterpriseId?: string;
  isEnterpriseInstall?: boolean;
} | null> {
  const tenant = await resolveSlackTenant(installationId);
  if (!tenant) return null;

  const integration = await prisma.integration.findUnique({
    where: { id: tenant.integrationId },
  });
  if (!integration || !isSlackTrulyConnected(integration)) return null;
  const meta = parseSlackMeta(integration.metadataJson);

  return {
    botToken: tenant.botToken,
    botUserId: tenant.botUserId ?? meta.botUserId,
    teamName: tenant.teamName ?? meta.teamName,
    enterpriseId: meta.enterpriseId,
    isEnterpriseInstall: meta.isEnterpriseInstall,
  };
}
