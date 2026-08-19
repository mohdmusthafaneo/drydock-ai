import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/token-crypto";
import {
  exchangeSlackCode,
  type SlackOAuthFlow,
} from "@/lib/slack-oauth";
import {
  mergeSlackMeta,
  parseSlackMeta,
  type SlackIntegrationMeta,
} from "@/lib/slack-meta";
import { invalidateSlackTenantCache } from "@/lib/slack/tenant";

import { determineActorType } from "@/lib/audit-helpers";
export type CompleteSlackOAuthConnectionInput = {
  organizationId: string;
  userId: string;
  code: string;
  via: "session" | "external_link";
  oauthFlow?: SlackOAuthFlow;
  inviteId?: string;
  auditUserId?: string;
};

export type CompleteSlackOAuthConnectionResult = {
  meta: SlackIntegrationMeta;
  displayName: string;
  externalDisplayName?: string;
};

export async function completeSlackOAuthConnection(
  input: CompleteSlackOAuthConnectionInput,
): Promise<CompleteSlackOAuthConnectionResult> {
  const oauthFlow = input.oauthFlow ?? "session";
  const tokens = await exchangeSlackCode(input.code, oauthFlow);

  const existing = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "SLACK",
      },
    },
  });

  const connectedAt = new Date().toISOString();
  const meta: SlackIntegrationMeta = {
    mode: "oauth-readonly",
    teamId: tokens.teamId,
    teamName: tokens.teamName,
    botUserId: tokens.botUserId,
    botTokenEnc: encryptToken(tokens.botToken),
    scope: tokens.scope,
    appId: tokens.appId,
    enterpriseId: tokens.enterpriseId,
    isEnterpriseInstall: tokens.isEnterpriseInstall,
    connectedBy: input.userId,
    connectedAt,
    connectedVia: input.via,
    connectionStatus: "ok",
    lastConnectionCheckAt: connectedAt,
    ...(input.via === "external_link"
      ? {
          externalConnector: {
            slackUserId: tokens.authedUserId,
          },
        }
      : {}),
  };

  const displayName = meta.teamName ?? `Slack ${meta.teamId}`;
  const auditAction =
    input.via === "external_link"
      ? "integration.slack.connected_external"
      : "integration.slack.connected";

  const auditMetadata =
    input.via === "external_link"
      ? {
          inviteId: input.inviteId,
          teamId: meta.teamId,
          teamName: meta.teamName,
          createdById: input.auditUserId ?? input.userId,
        }
      : { teamId: meta.teamId, teamName: meta.teamName };

  await prisma.$transaction(async (tx) => {
    await tx.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId: input.organizationId,
          provider: "SLACK",
        },
      },
      create: {
        organizationId: input.organizationId,
        provider: "SLACK",
        status: "CONNECTED",
        displayName,
        connectedAt: new Date(),
        metadataJson: mergeSlackMeta({}, meta),
      },
      update: {
        status: "CONNECTED",
        displayName,
        connectedAt: new Date(),
        lastError: null,
        metadataJson: mergeSlackMeta(
          existing ? parseSlackMeta(existing.metadataJson) : {},
          meta,
        ),
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: input.organizationId,
        type: "integration.connected",
        title:
          input.via === "external_link"
            ? "Slack connected via external link"
            : "Slack connected via OAuth",
        description: `Linked workspace ${displayName} — read-only assistant Q&A`,
        metadataJson: JSON.stringify({
          provider: "SLACK",
          teamId: meta.teamId,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.auditUserId ?? input.userId,
        action: auditAction,
        entityType: "Integration",
        metadataJson: JSON.stringify(auditMetadata),
        actorType: determineActorType(input.auditUserId ?? input.userId, auditAction),
      },
    });

    if (input.inviteId) {
      await tx.integrationConnectInvite.update({
        where: { id: input.inviteId },
        data: { usedAt: new Date() },
      });
    }
  });

  invalidateSlackTenantCache(meta.teamId);
  if (meta.enterpriseId) invalidateSlackTenantCache(meta.enterpriseId);

  return {
    meta,
    displayName,
  };
}
