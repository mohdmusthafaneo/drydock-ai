import { prisma } from "@/lib/prisma";
import {
  applyJiraMetaPatch,
  getJiraProject,
  JiraApiError,
  listJiraProjects,
  resolveJiraAccessToken,
  type JiraProjectSummary,
} from "@/lib/jira-api";
import { mergeJiraMeta, parseJiraMeta } from "@/lib/jira-meta";
import type { Integration } from "@/generated/prisma/client";

export const MAX_JIRA_SYNC_PROJECTS = 10;

export async function getConnectedJiraIntegration(
  organizationId: string,
): Promise<Integration> {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "JIRA",
      },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("Jira is not connected");
  }

  return integration;
}

function normalizeProjectKeys(keys: string[]): string[] {
  return [...new Set(keys.map((k) => k.trim().toUpperCase()).filter(Boolean))].slice(
    0,
    MAX_JIRA_SYNC_PROJECTS,
  );
}

export async function fetchOrgJiraProjects(organizationId: string): Promise<{
  projects: JiraProjectSummary[];
  selectedKeys: string[];
}> {
  const integration = await getConnectedJiraIntegration(organizationId);
  const meta = parseJiraMeta(integration.metadataJson);
  const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);

  if (metaPatch) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { metadataJson: applyJiraMetaPatch(integration, metaPatch) },
    });
  }

  const projects = await listJiraProjects(accessToken, cloudId, 50);
  return {
    projects,
    selectedKeys: meta.projectKeys ?? [],
  };
}

export async function saveOrgJiraProjectKeys(input: {
  organizationId: string;
  userId: string;
  projectKeys: string[];
}): Promise<{ projectKeys: string[] }> {
  const keys = normalizeProjectKeys(input.projectKeys);
  if (keys.length === 0) {
    throw new Error("Select at least one Jira project");
  }

  const integration = await getConnectedJiraIntegration(input.organizationId);
  const meta = parseJiraMeta(integration.metadataJson);
  const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);

  for (const key of keys) {
    try {
      await getJiraProject(accessToken, cloudId, key);
    } catch (e) {
      if (e instanceof JiraApiError && (e.status === 404 || e.status === 403)) {
        throw new Error(`Project ${key} is not accessible on this Jira site`);
      }
      throw e;
    }
  }

  const metadataJson = mergeJiraMeta(meta, {
    ...metaPatch,
    projectKeys: keys,
    lastError: undefined,
  });

  await prisma.$transaction(async (tx) => {
    await tx.integration.update({
      where: { id: integration.id },
      data: { metadataJson },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "integration.jira.projects_updated",
        entityType: "Integration",
        entityId: integration.id,
        metadataJson: JSON.stringify({ projectKeys: keys }),
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: input.organizationId,
        type: "integration.updated",
        title: "Jira sync projects updated",
        description: keys.join(", "),
        metadataJson: JSON.stringify({ provider: "JIRA", projectKeys: keys }),
      },
    });
  });

  return { projectKeys: keys };
}

export function resolveSyncProjectKeys(input: {
  metaKeys?: string[];
  bodyKeys?: string[];
}): string[] {
  if (input.bodyKeys && input.bodyKeys.length > 0) {
    return normalizeProjectKeys(input.bodyKeys);
  }
  if (input.metaKeys && input.metaKeys.length > 0) {
    return normalizeProjectKeys(input.metaKeys);
  }
  throw new Error("Select at least one Jira project before syncing.");
}
