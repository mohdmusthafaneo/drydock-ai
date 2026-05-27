import { prisma } from "@/lib/prisma";
import {
  mergeGitHubMeta,
  parseIntegrationMeta,
  type GitHubIntegrationMeta,
} from "@/lib/integration-meta";

export type PersistGitHubAppInstallationInput = {
  organizationId: string;
  userId: string;
  installationId: number;
  setupAction: string;
};

export type PersistGitHubAppInstallationResult = {
  isFirstInstall: boolean;
  mode: NonNullable<GitHubIntegrationMeta["mode"]>;
  installationId: number;
};

/**
 * Persist the GitHub App installation id onto the org's Integration row.
 *
 * Called from the /integrations page when GitHub redirects an admin back after
 * installing the AIDOS GitHub App. Idempotent — re-runs with the same
 * installation id are no-ops apart from refreshing `installedAt`.
 *
 * If the org already had an OAuth-mode integration, we preserve the OAuth
 * fields (token, login) and upgrade `mode` to "dual".
 */
export async function persistGitHubAppInstallation(
  input: PersistGitHubAppInstallationInput,
): Promise<PersistGitHubAppInstallationResult> {
  const existing = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "GITHUB",
      },
    },
  });

  const currentMeta = existing
    ? parseIntegrationMeta(existing.metadataJson)
    : {};

  const isFirstInstall = currentMeta.installationId !== input.installationId;
  const mode: GitHubIntegrationMeta["mode"] = currentMeta.accessTokenEnc
    ? "dual"
    : "app";

  const mergedMeta = mergeGitHubMeta(currentMeta, {
    mode,
    installationId: input.installationId,
    installedAt: new Date().toISOString(),
    installedBy: input.userId,
  });

  await prisma.$transaction(async (tx) => {
    await tx.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId: input.organizationId,
          provider: "GITHUB",
        },
      },
      create: {
        organizationId: input.organizationId,
        provider: "GITHUB",
        status: "CONNECTED",
        displayName: currentMeta.githubLogin ?? `Installation #${input.installationId}`,
        connectedAt: new Date(),
        webhookEnabled: true,
        metadataJson: mergedMeta,
      },
      update: {
        status: "CONNECTED",
        displayName:
          existing?.displayName ??
          currentMeta.githubLogin ??
          `Installation #${input.installationId}`,
        connectedAt: existing?.connectedAt ?? new Date(),
        webhookEnabled: true,
        lastError: null,
        metadataJson: mergedMeta,
      },
    });

    if (isFirstInstall) {
      await tx.activityEvent.create({
        data: {
          organizationId: input.organizationId,
          type: "integration.connected",
          title: "GitHub App installed",
          description: `AIDOS GitHub App installed (installation #${input.installationId}) — webhooks and org-wide access active.`,
          metadataJson: JSON.stringify({
            provider: "GITHUB",
            installationId: input.installationId,
            setupAction: input.setupAction,
          }),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          action: "integration.github.app_installed",
          entityType: "Integration",
          metadataJson: JSON.stringify({
            installationId: input.installationId,
            setupAction: input.setupAction,
          }),
        },
      });
    }
  });

  return {
    isFirstInstall,
    mode: mode!,
    installationId: input.installationId,
  };
}
