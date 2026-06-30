import { prisma } from "@/lib/prisma";
import { computeDeliveryAnalysisFromJira } from "@/lib/delivery-analysis/compute-snapshot";
import { persistDeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/persist";
import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";
import { markIntegrationSync } from "@/lib/integration-health";
import {
  countIssuesByJql,
  getJiraProject,
  JiraApiError,
  listBoardsForProject,
  listBoardSprints,
  listProjectVersions,
  resolveJiraAccessToken,
} from "@/lib/jira-api";
import {
  mergeJiraMeta,
  parseJiraMeta,
  type JiraDeliverySnapshot,
  type JiraStatusBreakdown,
} from "@/lib/jira-meta";
import { maybeIntrospectJiraAfterSync } from "@/lib/jira-introspection";
import {
  buildBlockedJql,
  buildBugJql,
  buildDoneJql,
  buildNotDoneJql,
  buildOpenJql,
  buildReopenedJql,
  buildSpilloverJql,
  jqlQuoteLiteral,
  LEGACY_JIRA_MAPPING,
  type JiraMappingSlice,
} from "@/lib/jira-jql";
import { assessPortfolioJiraHygiene } from "@/lib/jira-hygiene";
import { resolveSyncProjectKeys } from "@/lib/jira-project-selection";
import { enqueueJiraCalibration } from "@/lib/jira-calibration/run";
import { getJiraCalibrationGate } from "@/lib/jira-calibration/status";
import {
  resolveEffectiveToolchainMapping,
  resolveJiraMappingForProject,
  type ToolchainMapping,
} from "@/lib/toolchain-mapping";
import { ingestNormalizedEvents } from "@/lib/telemetry-ingest";

function isOverdueVersion(version: { released: boolean; releaseDate?: string }): boolean {
  if (version.released || !version.releaseDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(version.releaseDate) < today;
}

function pickBoard(boards: Array<{ id: number; name: string; type: string }>) {
  return (
    boards.find((b) => b.type === "scrum") ??
    boards.find((b) => b.type === "kanban") ??
    boards[0]
  );
}

/** Cap per-version JQL to limit approximate-count calls (see delivery-analysis.md P2b). */
const MAX_VERSION_JQL_COUNTS = 5;

function versionsForOpenCount(
  versions: JiraDeliverySnapshot["projects"][number]["versions"],
): JiraDeliverySnapshot["projects"][number]["versions"] {
  const unreleased = versions.filter((v) => !v.released);
  const released = versions.filter((v) => v.released);
  const ranked = [
    ...unreleased.sort((a, b) => (a.overdue && !b.overdue ? -1 : !a.overdue && b.overdue ? 1 : 0)),
    ...released,
  ];
  return ranked.slice(0, MAX_VERSION_JQL_COUNTS);
}

async function enrichProjectP2b(
  accessToken: string,
  cloudId: string,
  projectKey: string,
  versions: JiraDeliverySnapshot["projects"][number]["versions"],
  mapping: JiraMappingSlice,
): Promise<{
  resolvedLast7d: number;
  statusBreakdown: JiraStatusBreakdown;
  versions: JiraDeliverySnapshot["projects"][number]["versions"];
}> {
  const baseJql = `project = "${projectKey}"`;

  const [resolvedLast7d, todo, inProgress, done] = await Promise.all([
    countIssuesByJql(accessToken, cloudId, `${baseJql} AND resolved >= -7d`),
    countIssuesByJql(accessToken, cloudId, `${baseJql} AND statusCategory = "To Do"`),
    countIssuesByJql(accessToken, cloudId, `${baseJql} AND statusCategory = "In Progress"`),
    countIssuesByJql(accessToken, cloudId, buildDoneJql(baseJql, mapping)),
  ]);

  const statusBreakdown: JiraStatusBreakdown = { todo, inProgress, done };

  const versionsToCount = versionsForOpenCount(versions);
  const countTargets = new Set(versionsToCount.map((v) => v.id));
  const enrichedVersions = await Promise.all(
    versions.map(async (v) => {
      if (!countTargets.has(v.id)) return v;
      try {
        const openIssuesInVersion = await countIssuesByJql(
          accessToken,
          cloudId,
          `${baseJql} AND fixVersion = ${jqlQuoteLiteral(v.name)} AND ${buildNotDoneJql(mapping)}`,
        );
        return { ...v, openIssuesInVersion };
      } catch (e) {
        if (e instanceof JiraApiError && [400, 404].includes(e.status)) {
          return v;
        }
        throw e;
      }
    }),
  );

  return { resolvedLast7d, statusBreakdown, versions: enrichedVersions };
}

async function enrichHygieneCounts(
  accessToken: string,
  cloudId: string,
  projectKey: string,
  baseJql: string,
  mapping: JiraMappingSlice,
  projectMapping?: NonNullable<ToolchainMapping["jira"]>,
): Promise<{ missingEstimateCount?: number; missingDueDateCount?: number }> {
  const result: { missingEstimateCount?: number; missingDueDateCount?: number } = {};

  const storyPointField = projectMapping?.storyPointField;
  if (storyPointField?.id) {
    try {
      result.missingEstimateCount = await countIssuesByJql(
        accessToken,
        cloudId,
        `${baseJql} AND ${buildNotDoneJql(mapping)} AND ${storyPointField.id} is EMPTY`,
      );
    } catch (e) {
      if (!(e instanceof JiraApiError) || ![400, 401, 403, 404, 429].includes(e.status)) {
        throw e;
      }
    }
  }

  try {
    result.missingDueDateCount = await countIssuesByJql(
      accessToken,
      cloudId,
      `${baseJql} AND statusCategory = "In Progress" AND duedate is EMPTY`,
    );
  } catch (e) {
    if (!(e instanceof JiraApiError) || ![400, 401, 403, 404, 429].includes(e.status)) {
      throw e;
    }
  }

  return result;
}

async function syncProject(
  accessToken: string,
  cloudId: string,
  projectKey: string,
  mapping: JiraMappingSlice,
  projectMapping?: NonNullable<ToolchainMapping["jira"]>,
): Promise<JiraDeliverySnapshot["projects"][number]> {
  const project = await getJiraProject(accessToken, cloudId, projectKey);
  const baseJql = `project = "${projectKey}"`;

  const [openIssues, blockedCount, overdueCount, bugsOpen, unassignedCount, rawVersions] =
    await Promise.all([
      countIssuesByJql(accessToken, cloudId, buildOpenJql(baseJql, mapping)),
      countIssuesByJql(accessToken, cloudId, buildBlockedJql(baseJql, mapping)),
      countIssuesByJql(
        accessToken,
        cloudId,
        `${baseJql} AND duedate < now() AND ${buildNotDoneJql(mapping)}`,
      ),
      countIssuesByJql(accessToken, cloudId, buildBugJql(baseJql, mapping)),
      countIssuesByJql(
        accessToken,
        cloudId,
        `${baseJql} AND assignee is EMPTY AND ${buildNotDoneJql(mapping)}`,
      ),
      listProjectVersions(accessToken, cloudId, projectKey),
    ]);

  const versions = rawVersions.map((v) => ({
    ...v,
    overdue: isOverdueVersion(v),
  }));

  let board: JiraDeliverySnapshot["projects"][number]["board"];
  let activeSprint: JiraDeliverySnapshot["projects"][number]["activeSprint"];
  let spilloverCount: number | undefined;

  try {
    const boards = await listBoardsForProject(accessToken, cloudId, projectKey);
    const picked = pickBoard(boards);

    if (picked) {
      board = { id: picked.id, name: picked.name, type: picked.type };

      if (picked.type === "scrum") {
        const sprints = await listBoardSprints(accessToken, cloudId, picked.id);
        const sprint = sprints.find((s) => s.state === "active") ?? sprints[0];
        if (sprint) {
          const [committed, done] = await Promise.all([
            countIssuesByJql(accessToken, cloudId, `sprint = ${sprint.id}`),
            countIssuesByJql(
              accessToken,
              cloudId,
              `sprint = ${sprint.id} AND statusCategory = ${jqlQuoteLiteral(mapping.doneStatusCategory)}`,
            ),
          ]);
          activeSprint = {
            id: sprint.id,
            name: sprint.name,
            state: sprint.state,
            startDate: sprint.startDate,
            endDate: sprint.endDate,
            committed,
            done,
          };

          try {
            spilloverCount = await countIssuesByJql(
              accessToken,
              cloudId,
              buildSpilloverJql(sprint.id),
            );
          } catch (e) {
            if (!(e instanceof JiraApiError) || ![400, 401, 403, 404, 429].includes(e.status)) {
              throw e;
            }
          }
        }
      }
    }
  } catch (e) {
    if (!(e instanceof JiraApiError) || ![401, 403, 404].includes(e.status)) {
      throw e;
    }
    // Board/sprint data requires Jira Software scopes — skip when unavailable.
  }

  let resolvedLast7d: number | undefined;
  let statusBreakdown: JiraStatusBreakdown | undefined;
  let enrichedVersions: JiraDeliverySnapshot["projects"][number]["versions"] = versions;

  try {
    const p2b = await enrichProjectP2b(accessToken, cloudId, projectKey, versions, mapping);
    resolvedLast7d = p2b.resolvedLast7d;
    statusBreakdown = p2b.statusBreakdown;
    enrichedVersions = p2b.versions;
  } catch (e) {
    if (!(e instanceof JiraApiError) || ![400, 401, 403, 404, 429].includes(e.status)) {
      throw e;
    }
    // P2b enrichment is best-effort when JQL or rate limits fail.
  }

  let missingEstimateCount: number | undefined;
  let missingDueDateCount: number | undefined;
  try {
    const hygieneCounts = await enrichHygieneCounts(
      accessToken,
      cloudId,
      projectKey,
      baseJql,
      mapping,
      projectMapping,
    );
    missingEstimateCount = hygieneCounts.missingEstimateCount;
    missingDueDateCount = hygieneCounts.missingDueDateCount;
  } catch (e) {
    if (!(e instanceof JiraApiError) || ![400, 401, 403, 404, 429].includes(e.status)) {
      throw e;
    }
  }

  let reopenedCount: number | undefined;
  const reopenedJql = buildReopenedJql(baseJql, mapping);
  if (reopenedJql) {
    try {
      reopenedCount = await countIssuesByJql(accessToken, cloudId, reopenedJql);
    } catch (e) {
      if (!(e instanceof JiraApiError) || ![400, 401, 403, 404, 429].includes(e.status)) {
        throw e;
      }
    }
  }

  return {
    key: project.key,
    name: project.name,
    openIssues,
    blockedCount,
    overdueCount,
    reopenedCount,
    spilloverCount,
    bugsOpen,
    unassignedCount,
    missingEstimateCount,
    missingDueDateCount,
    resolvedLast7d,
    statusBreakdown,
    versions: enrichedVersions,
    board,
    activeSprint,
  };
}

export async function syncJiraIntegration(input: {
  organizationId: string;
  userId: string;
  projectKeys?: string[];
}) {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "JIRA",
      },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("Jira is not connected");
  }

  const meta = parseJiraMeta(integration.metadataJson);
  const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);

  const effectiveMapping = await resolveEffectiveToolchainMapping(input.organizationId);
  const jiraMapping: JiraMappingSlice = effectiveMapping?.jira
    ? {
        blockedStatusName: effectiveMapping.jira.blockedStatusName,
        bugIssueType: effectiveMapping.jira.bugIssueType,
        doneStatusCategory: effectiveMapping.jira.doneStatusCategory,
        doneStatusNames: effectiveMapping.jira.doneStatusNames,
      }
    : LEGACY_JIRA_MAPPING;

  const projectKeys = resolveSyncProjectKeys({
    metaKeys: meta.projectKeys,
    bodyKeys: input.projectKeys,
  });

  if (projectKeys.length === 0) {
    throw new Error("No Jira projects found to sync");
  }

  const telemetryEvents: Parameters<typeof ingestNormalizedEvents>[0]["events"] = [
    {
      eventType: "custom",
      source: "jira",
      severity: "info",
      payload: {
        action: "sync.started",
        projectKeys,
      },
    },
  ];

  const projects: JiraDeliverySnapshot["projects"] = [];

  for (const key of projectKeys) {
    try {
      const projectMapping = effectiveMapping
        ? resolveJiraMappingForProject(effectiveMapping, key)
        : undefined;
      const snapshot = await syncProject(
        accessToken,
        cloudId,
        key,
        jiraMapping,
        projectMapping,
      );
      projects.push(snapshot);

      telemetryEvents.push({
        eventType: "custom",
        source: "jira",
        severity: snapshot.blockedCount > 0 ? "warning" : "info",
        service: key,
        payload: {
          action: "project.synced",
          openIssues: snapshot.openIssues,
          blockedCount: snapshot.blockedCount,
          overdueCount: snapshot.overdueCount,
          bugsOpen: snapshot.bugsOpen,
          versionCount: snapshot.versions.length,
          activeSprint: snapshot.activeSprint?.name,
        },
      });
    } catch (e) {
      if (e instanceof JiraApiError && (e.status === 404 || e.status === 403)) {
        continue;
      }
      throw e;
    }
  }

  if (projects.length === 0) {
    throw new Error(`Could not sync any of: ${projectKeys.join(", ")}`);
  }

  const syncedAt = new Date().toISOString();
  const deliverySnapshot: JiraDeliverySnapshot = { syncedAt, projects };

  const jiraHygiene = effectiveMapping
    ? assessPortfolioJiraHygiene(deliverySnapshot, effectiveMapping)
    : undefined;

  const totalOpen = projects.reduce((n, p) => n + p.openIssues, 0);
  const totalBlocked = projects.reduce((n, p) => n + p.blockedCount, 0);
  const totalVersions = projects.reduce((n, p) => n + p.versions.length, 0);
  const summary = `Synced ${projects.map((p) => p.key).join(", ")} · ${totalOpen} open · ${totalBlocked} blocked · ${totalVersions} versions`;

  const calibrationGate = await getJiraCalibrationGate(input.organizationId);

  const analysisRollup = computeDeliveryAnalysisFromJira({
    jiraSnapshot: deliverySnapshot,
    siteUrl: meta.siteUrl,
    filters: {
      projectKey: null,
      riskFocus: "all",
      range: "30d",
      compare: "previous_sync",
    },
    mapping: effectiveMapping ?? undefined,
    jiraHygiene,
    calibrationPending: !calibrationGate.calibrated,
    calibrationMessage: calibrationGate.message,
  });

  void enqueueJiraCalibration(
    input.organizationId,
    projects.map((p) => p.key),
  );

  await ingestNormalizedEvents({
    organizationId: input.organizationId,
    userId: input.userId,
    events: telemetryEvents,
  });

  const metadataJson = mergeJiraMeta(meta, {
    ...metaPatch,
    projectKeys: projects.map((p) => p.key),
    lastSyncSummary: summary,
    deliverySnapshot,
    jiraHygiene,
    deliveryAnalysisSnapshot: {
      generatedAt: analysisRollup.generatedAt,
      healthScore: analysisRollup.kpis.healthScore,
      openWork: analysisRollup.kpis.openWork,
      projectKeys: analysisRollup.projectKeys,
    },
    lastError: undefined,
  });

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      metadataJson,
      lastSyncAt: new Date(),
      lastError: null,
    },
  });

  await markIntegrationSync(input.organizationId, "JIRA");

  void maybeIntrospectJiraAfterSync(input.organizationId);

  await persistDeliveryAnalysisSnapshot({
    organizationId: input.organizationId,
    integrationId: integration.id,
    jiraSnapshot: deliverySnapshot,
    siteUrl: meta.siteUrl,
    syncedAt: new Date(syncedAt),
  });

  invalidateExecutiveBriefingSnapshot(input.organizationId);

  await prisma.activityEvent.create({
    data: {
      organizationId: input.organizationId,
      type: "integration.synced",
      title: "Jira delivery snapshot synchronized",
      description: summary,
      metadataJson: JSON.stringify({
        provider: "JIRA",
        projectCount: projects.length,
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      action: "integration.jira.synced",
      entityType: "Integration",
      entityId: integration.id,
      metadataJson: JSON.stringify({
        projectKeys: projects.map((p) => p.key),
        openIssues: totalOpen,
      }),
    },
  });

  await prisma.activityEvent.create({
    data: {
      organizationId: input.organizationId,
      type: "delivery_analysis.synced",
      title: "Delivery analysis snapshot saved",
      description: `Health ${analysisRollup.kpis.healthScore} · ${analysisRollup.kpis.openWork} open issues`,
      metadataJson: JSON.stringify({
        healthScore: analysisRollup.kpis.healthScore,
        projectCount: projects.length,
      }),
    },
  });

  return { summary, syncedAt, projectCount: projects.length, deliverySnapshot };
}
