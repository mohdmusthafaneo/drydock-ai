import { prisma } from "@/lib/prisma";
import { determineActorType } from "@/lib/audit-helpers";
import { encryptToken } from "@/lib/token-crypto";
import { exchangeGitLabCode, getGitLabBaseUrl } from "@/lib/gitlab-oauth";
import { fetchGitLabUser } from "@/lib/gitlab-api";
import { mergeGitLabMeta, parseGitLabMeta, type GitLabIntegrationMeta } from "@/lib/gitlab-meta";

export type CompleteGitLabOAuthConnectionInput = {
  organizationId: string;
  userId: string;
  code: string;
  via: "session" | "external_link";
  inviteId?: string;
};

export type CompleteGitLabOAuthConnectionResult = {
  username: string;
  baseUrl: string;
  meta: GitLabIntegrationMeta;
};

export async function completeGitLabOAuthConnection(
  input: CompleteGitLabOAuthConnectionInput,
): Promise<CompleteGitLabOAuthConnectionResult> {
  const tokens = await exchangeGitLabCode(input.code);
  if (tokens.expiresAt && !tokens.refreshToken) {
    throw new Error("GitLab did not return a refresh token");
  }

  const baseUrl = getGitLabBaseUrl();
  const user = await fetchGitLabUser(tokens.accessToken, baseUrl);

  const existing = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "GITLAB",
      },
    },
  });

  const metaJson = mergeGitLabMeta(existing ? parseGitLabMeta(existing.metadataJson) : {}, {
    mode: "oauth",
    baseUrl,
    username: user.username,
    gitlabUserId: user.id,
    name: user.name,
    scope: tokens.scope,
    accessTokenEnc: encryptToken(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : undefined,
    accessTokenExpiresAt: tokens.expiresAt,
    connectedBy: input.userId,
    connectedVia: input.via,
  });

  const title =
    input.via === "external_link"
      ? "GitLab connected via share link"
      : "GitLab connected via OAuth";

  await prisma.$transaction(async (tx) => {
    await tx.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId: input.organizationId,
          provider: "GITLAB",
        },
      },
      create: {
        organizationId: input.organizationId,
        provider: "GITLAB",
        status: "CONNECTED",
        displayName: user.username,
        connectedAt: new Date(),
        metadataJson: metaJson,
      },
      update: {
        status: "CONNECTED",
        displayName: user.username,
        connectedAt: new Date(),
        lastError: null,
        metadataJson: metaJson,
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: input.organizationId,
        type: "integration.connected",
        title,
        description: `Linked @${user.username} — read-only access`,
        metadataJson: JSON.stringify({ provider: "GITLAB", baseUrl, via: input.via }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "integration.gitlab.connected",
        entityType: "Integration",
        metadataJson: JSON.stringify({
          gitlabUsername: user.username,
          baseUrl,
          via: input.via,
          inviteId: input.inviteId,
        }),
        actorType: determineActorType(input.userId, "integration.gitlab.connected"),
      },
    });

    if (input.inviteId) {
      await tx.integrationConnectInvite.update({
        where: { id: input.inviteId },
        data: { usedAt: new Date() },
      });
    }
  });

  return {
    username: user.username,
    baseUrl,
    meta: parseGitLabMeta(metaJson),
  };
}
