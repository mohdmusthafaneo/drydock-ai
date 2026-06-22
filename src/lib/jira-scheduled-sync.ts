import { prisma } from "@/lib/prisma";
import { syncJiraIntegration } from "@/lib/jira-sync";
import { parseJiraMeta } from "@/lib/jira-meta";
import { JiraApiError, recordJiraIntegrationFailure } from "@/lib/jira-api";

export type ScheduledJiraSyncOrgResult = {
  organizationId: string;
  status: "synced" | "skipped" | "failed";
  reason?: string;
  summary?: string;
  syncedAt?: string;
  projectCount?: number;
  error?: string;
};

async function resolveOrgActorUserId(organizationId: string): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { organizationId, status: "ACTIVE", role: "ORG_ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (admin) return admin.id;

  const anyUser = await prisma.user.findFirst({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return anyUser?.id ?? null;
}

export async function runScheduledJiraSync(input?: {
  organizationId?: string;
}): Promise<{
  attempted: number;
  synced: number;
  skipped: number;
  failed: number;
  results: ScheduledJiraSyncOrgResult[];
}> {
  const integrations = await prisma.integration.findMany({
    where: {
      provider: "JIRA",
      status: "CONNECTED",
      ...(input?.organizationId ? { organizationId: input.organizationId } : {}),
    },
    select: { organizationId: true, metadataJson: true },
    orderBy: { organizationId: "asc" },
  });

  const results: ScheduledJiraSyncOrgResult[] = [];

  for (const integration of integrations) {
    const { organizationId } = integration;
    const meta = parseJiraMeta(integration.metadataJson);

    if (!meta.projectKeys?.length) {
      results.push({
        organizationId,
        status: "skipped",
        reason: "no_projects_selected",
      });
      continue;
    }

    const userId = await resolveOrgActorUserId(organizationId);
    if (!userId) {
      results.push({
        organizationId,
        status: "skipped",
        reason: "no_active_user",
      });
      continue;
    }

    try {
      const result = await syncJiraIntegration({ organizationId, userId });
      results.push({
        organizationId,
        status: "synced",
        summary: result.summary,
        syncedAt: result.syncedAt,
        projectCount: result.projectCount,
      });
    } catch (e) {
      const message = await recordJiraIntegrationFailure(organizationId, e);

      results.push({
        organizationId,
        status: "failed",
        error: message,
        ...(e instanceof JiraApiError ? { reason: `jira_api_${e.status}` } : {}),
      });
    }
  }

  if (input?.organizationId && integrations.length === 0) {
    results.push({
      organizationId: input.organizationId,
      status: "skipped",
      reason: "jira_not_connected",
    });
  }

  const synced = results.filter((r) => r.status === "synced").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return {
    attempted: results.length,
    synced,
    skipped,
    failed,
    results,
  };
}
