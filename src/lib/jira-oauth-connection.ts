import { prisma } from "@/lib/prisma";
import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";
import { buildJiraOAuthMeta } from "@/lib/jira-api";
import { mergeJiraMeta, parseJiraMeta, type JiraIntegrationMeta } from "@/lib/jira-meta";
import {
  exchangeJiraCode,
  fetchAccessibleResources,
  fetchJiraMyself,
  type JiraOAuthFlow,
} from "@/lib/jira-oauth";

export type CompleteJiraOAuthConnectionInput = {
  organizationId: string;
  userId: string;
  code: string;
  via: "session" | "external_link";
  oauthFlow?: JiraOAuthFlow;
  inviteId?: string;
  auditUserId?: string;
};

export type CompleteJiraOAuthConnectionResult = {
  meta: JiraIntegrationMeta;
  displayName: string;
  externalDisplayName?: string;
};

export async function completeJiraOAuthConnection(
  input: CompleteJiraOAuthConnectionInput,
): Promise<CompleteJiraOAuthConnectionResult> {
  const oauthFlow = input.oauthFlow ?? "session";
  const { accessToken, refreshToken, scope } = await exchangeJiraCode(
    input.code,
    oauthFlow,
  );
  const resources = await fetchAccessibleResources(accessToken);

  if (resources.length === 0) {
    throw new Error("No accessible Jira Cloud sites for this account");
  }

  const primaryCloudId = resources[0].id;
  let myself: { accountId: string; displayName: string } | undefined;
  try {
    const profile = await fetchJiraMyself(accessToken, primaryCloudId);
    myself = { accountId: profile.accountId, displayName: profile.displayName };
  } catch {
    // Profile fetch is optional for connection
  }

  const existing = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "JIRA",
      },
    },
  });

  const baseMeta = buildJiraOAuthMeta({
    existing: existing ? parseJiraMeta(existing.metadataJson) : undefined,
    accessToken,
    refreshToken,
    scope,
    userId: input.userId,
    resources,
    myself,
  });

  const meta: JiraIntegrationMeta = {
    ...baseMeta,
    connectedVia: input.via,
    ...(input.via === "external_link" && myself
      ? {
          externalConnector: {
            displayName: myself.displayName,
            accountId: myself.accountId,
          },
        }
      : {}),
  };

  const displayName = meta.siteName ?? meta.siteUrl.replace(/^https?:\/\//, "");
  const auditAction =
    input.via === "external_link"
      ? "integration.jira.connected_external"
      : "integration.jira.connected";

  const auditMetadata =
    input.via === "external_link"
      ? {
          inviteId: input.inviteId,
          siteUrl: meta.siteUrl,
          cloudId: meta.cloudId,
          externalDisplayName: myself?.displayName,
          createdById: input.auditUserId ?? input.userId,
        }
      : { siteUrl: meta.siteUrl, cloudId: meta.cloudId };

  await prisma.$transaction(async (tx) => {
    await tx.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId: input.organizationId,
          provider: "JIRA",
        },
      },
      create: {
        organizationId: input.organizationId,
        provider: "JIRA",
        status: "CONNECTED",
        displayName,
        connectedAt: new Date(),
        metadataJson: mergeJiraMeta({}, meta),
      },
      update: {
        status: "CONNECTED",
        displayName,
        connectedAt: new Date(),
        lastError: null,
        metadataJson: mergeJiraMeta(
          existing ? parseJiraMeta(existing.metadataJson) : {},
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
            ? "Jira connected via external link"
            : "Jira connected via OAuth",
        description: `Linked ${meta.siteUrl} — read-only delivery intelligence`,
        metadataJson: JSON.stringify({ provider: "JIRA", cloudId: meta.cloudId }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.auditUserId ?? input.userId,
        action: auditAction,
        entityType: "Integration",
        metadataJson: JSON.stringify(auditMetadata),
      },
    });

    if (input.inviteId) {
      await tx.integrationConnectInvite.update({
        where: { id: input.inviteId },
        data: { usedAt: new Date() },
      });
    }
  });

  invalidateExecutiveBriefingSnapshot(input.organizationId);

  return {
    meta,
    displayName,
    externalDisplayName: myself?.displayName,
  };
}
