import { prisma } from "@/lib/prisma";
import { computeDeliveryAnalysisFromJira } from "@/lib/delivery-analysis/compute-snapshot";
import { persistDeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/persist";
import { invalidateExecutiveBriefingSnapshot } from "@/lib/executive-briefing/invalidate-snapshot";
import { markIntegrationSync } from "@/lib/integration-health";
import {
  countIssuesByJql,
  fetchAllSprintIssues,
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
  buildSprintDoneJql,
  buildStaleOpenJql,
  buildUnknownWorkflowStatusJql,
  jqlQuoteLiteral,
  LEGACY_JIRA_MAPPING,
  type JiraMappingSlice,
} from "@/lib/jira-jql";
import { determineActorType } from "@/lib/audit-helpers";
import { resolveSpilloverCount } from "@/lib/jira-spillover";
import {
  aggregateSprintIssues,
  sprintDaysOverdue,
} from "@/lib/jira-sprint-metrics";
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

async function upsertFixVersionReleases(
  organizationId: string,
  projects: JiraDeliverySnapshot["projects"],
  releaseTracking: string | undefined,
): Promise<void> {
  if (releaseTracking !== "fixVersion") return;

  for (const project of projects) {
    for (const version of project.versions) {
      if (version.released) continue;
      await upsertFixVersionRelease(organizationId, project.key, version);
    }
  }
}

function readinessScoreForOpenCount(openCount: number): number {
  if (openCount === 0) return 100;
  if (openCount <= 5) return 75;
  if (openCount <= 15) return 50;
  return 25;
}

async function upsertFixVersionRelease(
  organizationId: string,
  projectKey: string,
  version: { id: string; name: string; releaseDate?: string | null; openIssuesInVersion?: number | null },
): Promise<void> {
  const openCount = version.openIssuesInVersion ?? 0;
  const readinessScore = readinessScoreForOpenCount(openCount);

  const existing = await prisma.release.findFirst({
    where: {
      organizationId,
      jiraFixVersion: version.name,
      serviceScope: projectKey,
    },
  });

  const data = {
    name: version.name,
    version: version.name,
    jiraFixVersion: version.name,
    serviceScope: projectKey,
    readinessScore,
    status: "DETECTED" as const,
    metadataJson: JSON.stringify({
      source: "jira_fixversion_sync",
      projectKey,
      versionId: version.id,
      releaseDate: version.releaseDate,
    }),
  };

  if (existing) {
    await prisma.release.update({ where: { id: existing.id }, data });
  } else {
    await prisma.release.create({
      data: {
        organizationId,
        environment: "STAGING",
        ...data,
      },
    });
  }
}

async function upsertSprintReleases(
  organizationId: string,
  projects: JiraDeliverySnapshot["projects"],
  releaseTracking: string | undefined,
): Promise<void> {
  const trackSprints =
    releaseTracking === "sprint" || projects.some((p) => p.activeSprint != null);
  if (!trackSprints) return;

  for (const project of projects) {
    const sprint = project.activeSprint;
    if (!sprint) continue;

    const committed = sprint.committed ?? 0;
    const done = sprint.done ?? 0;
    const readinessScore =
      committed > 0 ? Math.round((done / committed) * 100) : null;

    const existing = await prisma.release.findFirst({
      where: { organizationId, jiraSprintId: sprint.id },
    });

    const data = {
      name: sprint.name,
      serviceScope: project.key,
      readinessScore,
      status: sprint.state === "closed" ? ("DEPLOYED" as const) : ("DETECTED" as const),
      metadataJson: JSON.stringify({
        source: "jira_sync",
        projectKey: project.key,
        sprintState: sprint.state,
        sprintEndDate: sprint.endDate,
      }),
    };

    if (existing) {
      await prisma.release.update({ where: { id: existing.id }, data });
    } else {
      await prisma.release.create({
        data: {
          organizationId,
          jiraSprintId: sprint.id,
          environment: "STAGING",
          ...data,
        },
      });
    }
  }
}

function isOverdueVersion(version: { released: boolean; releaseDate?: string }): boolean {
  if (version.released || !version.releaseDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(version.releaseDate) < today;
}

function recordJqlFailure(flags: string[], label: string): void {
  if (!flags.includes(label)) flags.push(label);
}

async function countIssuesSafe(
  accessToken: string,
  cloudId: string,
  jql: string,
  flags: string[],
  label: string,
): Promise<number | undefined> {
  try {
    return await countIssuesByJql(accessToken, cloudId, jql);
  } catch (e) {
    if (e instanceof JiraApiError && [400, 401, 403, 404, 429].includes(e.status)) {
      recordJqlFailure(flags, label);
      return undefined;
    }
    throw e;
  }
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

  const enrichedVersions = await enrichVersionsWithOpenCount(
    accessToken,
    cloudId,
    baseJql,
    versions,
    mapping,
  );

  return { resolvedLast7d, statusBreakdown, versions: enrichedVersions };
}

async function enrichVersionsWithOpenCount(
  accessToken: string,
  cloudId: string,
  baseJql: string,
  versions: JiraDeliverySnapshot["projects"][number]["versions"],
  mapping: JiraMappingSlice,
): Promise<JiraDeliverySnapshot["projects"][number]["versions"]> {
  const versionsToCount = versionsForOpenCount(versions);
  const countTargets = new Set(versionsToCount.map((v) => v.id));
  return Promise.all(
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
}

async function enrichHygieneCounts(
  accessToken: string,
  cloudId: string,
  projectKey: string,
  baseJql: string,
  mapping: JiraMappingSlice,
  projectMapping?: NonNullable<ToolchainMapping["jira"]>,
  jqlFailures?: string[],
): Promise<{
  missingEstimateCount?: number;
  missingDueDateCount?: number;
  staleOpenCount?: number;
  unknownWorkflowStatusCount?: number;
}> {
  const result: {
    missingEstimateCount?: number;
    missingDueDateCount?: number;
    staleOpenCount?: number;
    unknownWorkflowStatusCount?: number;
  } = {};
  const flags = jqlFailures ?? [];

  const storyPointField = projectMapping?.storyPointField;
  if (storyPointField?.id) {
    result.missingEstimateCount = await countIssuesSafe(
      accessToken,
      cloudId,
      `${baseJql} AND ${buildNotDoneJql(mapping)} AND ${storyPointField.id} is EMPTY`,
      flags,
      "missing_estimates",
    );
  }

  result.missingDueDateCount = await countIssuesSafe(
    accessToken,
    cloudId,
    `${baseJql} AND statusCategory = "In Progress" AND duedate is EMPTY`,
    flags,
    "missing_due_dates",
  );

  result.staleOpenCount = await countIssuesSafe(
    accessToken,
    cloudId,
    buildStaleOpenJql(baseJql, mapping),
    flags,
    "stale_open",
  );

  result.unknownWorkflowStatusCount = await countIssuesSafe(
    accessToken,
    cloudId,
    buildUnknownWorkflowStatusJql(baseJql, mapping),
    flags,
    "unknown_status",
  );

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
  const jqlPartialFailures: string[] = [];

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
  let qaPipelineCount: number | undefined;
  let assigneeWorkload: JiraDeliverySnapshot["projects"][number]["assigneeWorkload"];

  try {
    const boards = await listBoardsForProject(accessToken, cloudId, projectKey);
    const picked = pickBoard(boards);

    if (picked) {
      board = { id: picked.id, name: picked.name, type: picked.type };

      // Fetch sprints for any board that supports the agile API — some SCRUM boards
      // report type "simple" instead of "scrum" (e.g. Connexus CX board).
      const sprints = await listBoardSprints(accessToken, cloudId, picked.id);
      const sprint = sprints.find((s) => s.state === "active") ?? sprints[0];
      if (sprint) {
        const storyPointFieldId = projectMapping?.storyPointField?.id;
        const sprintData = await resolveSprintIssuesAndCounts({
          accessToken,
          cloudId,
          sprint,
          mapping,
          storyPointFieldId,
          jqlPartialFailures,
        });
        const committed = sprintData.committed;
        const done = sprintData.done;
        const sprintStatusByName = sprintData.sprintStatusByName;
        const storyPoints = sprintData.storyPoints;
        const sprintQaCount = sprintData.sprintQaCount;
        const sprintAssigneeWorkload = sprintData.sprintAssigneeWorkload;
        const sprintIssues = sprintData.sprintIssues;

        const daysOverdue =
          sprint.state === "active" ? sprintDaysOverdue(sprint.endDate) : 0;

        const sprintJql = `sprint = ${sprint.id}`;
        const [sprintBlocked, sprintOverdue, sprintBugs, sprintUnassigned] =
          await Promise.all([
            countIssuesSafe(
              accessToken,
              cloudId,
              buildBlockedJql(sprintJql, mapping),
              jqlPartialFailures,
              "sprint_blocked",
            ),
            countIssuesSafe(
              accessToken,
              cloudId,
              `${sprintJql} AND duedate < now() AND ${buildNotDoneJql(mapping)}`,
              jqlPartialFailures,
              "sprint_overdue",
            ),
            countIssuesSafe(
              accessToken,
              cloudId,
              buildBugJql(sprintJql, mapping),
              jqlPartialFailures,
              "sprint_bugs",
            ),
            countIssuesSafe(
              accessToken,
              cloudId,
              `${sprintJql} AND assignee is EMPTY AND ${buildNotDoneJql(mapping)}`,
              jqlPartialFailures,
              "sprint_unassigned",
            ),
          ]);

        const sprintReopenedJql = buildReopenedJql(sprintJql, mapping);
        const sprintReopened = sprintReopenedJql
          ? await countIssuesSafe(
              accessToken,
              cloudId,
              sprintReopenedJql,
              jqlPartialFailures,
              "sprint_reopened",
            )
          : undefined;

        activeSprint = {
          id: sprint.id,
          name: sprint.name,
          state: sprint.state,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          committed,
          done,
          openIssues: Math.max(0, committed - (done ?? 0)),
          blockedCount: sprintBlocked,
          overdueCount: sprintOverdue,
          bugsOpen: sprintBugs,
          reopenedCount: sprintReopened,
          unassignedCount: sprintUnassigned,
          statusByName: sprintStatusByName,
          storyPoints,
          qaPipelineCount: sprintQaCount,
          daysOverdue: daysOverdue > 0 ? daysOverdue : undefined,
        };

        qaPipelineCount = sprintQaCount;
        assigneeWorkload = sprintAssigneeWorkload;

        try {
          const spillover = await resolveSpilloverCount(accessToken, cloudId, {
            sprintId: sprint.id,
            sprintStartDate: sprint.startDate,
            sprintName: sprint.name,
            boardId: picked.id,
            mapping,
            sprintIssues: sprintIssues.length > 0 ? sprintIssues : undefined,
            useChangelog: sprintIssues.length > 0 && sprintIssues.length <= 80,
          });
          spilloverCount = spillover.count;
          if (activeSprint) {
            activeSprint = { ...activeSprint, spilloverCount };
          }
        } catch (e) {
          if (e instanceof JiraApiError && [400, 401, 403, 404, 429].includes(e.status)) {
            recordJqlFailure(jqlPartialFailures, "spillover");
          } else {
            throw e;
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
    if (e instanceof JiraApiError && [400, 401, 403, 404, 429].includes(e.status)) {
      recordJqlFailure(jqlPartialFailures, "p2b_enrichment");
    } else if (!(e instanceof JiraApiError) || ![400, 401, 403, 404, 429].includes(e.status)) {
      throw e;
    }
    // P2b enrichment is best-effort when JQL or rate limits fail.
  }

  let missingEstimateCount: number | undefined;
  let missingDueDateCount: number | undefined;
  let staleOpenCount: number | undefined;
  let unknownWorkflowStatusCount: number | undefined;
  try {
    const hygieneCounts = await enrichHygieneCounts(
      accessToken,
      cloudId,
      projectKey,
      baseJql,
      mapping,
      projectMapping,
      jqlPartialFailures,
    );
    missingEstimateCount = hygieneCounts.missingEstimateCount;
    missingDueDateCount = hygieneCounts.missingDueDateCount;
    staleOpenCount = hygieneCounts.staleOpenCount;
    unknownWorkflowStatusCount = hygieneCounts.unknownWorkflowStatusCount;
  } catch (e) {
    if (e instanceof JiraApiError && [400, 401, 403, 404, 429].includes(e.status)) {
      recordJqlFailure(jqlPartialFailures, "hygiene_counts");
    } else if (!(e instanceof JiraApiError) || ![400, 401, 403, 404, 429].includes(e.status)) {
      throw e;
    }
  }

  let reopenedCount: number | undefined;
  const reopenedJql = buildReopenedJql(baseJql, mapping);
  if (reopenedJql) {
    reopenedCount = await countIssuesSafe(
      accessToken,
      cloudId,
      reopenedJql,
      jqlPartialFailures,
      "reopened",
    );
  }

  if (activeSprint?.statusByName && statusBreakdown) {
    statusBreakdown = { ...statusBreakdown, byName: activeSprint.statusByName };
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
    staleOpenCount,
    unknownWorkflowStatusCount,
    jqlPartialFailures: jqlPartialFailures.length > 0 ? jqlPartialFailures : undefined,
    resolvedLast7d,
    statusBreakdown,
    qaPipelineCount,
    assigneeWorkload,
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
  const dataQualityFlags = [
    ...new Set(projects.flatMap((p) => p.jqlPartialFailures ?? [])),
  ];
  const deliverySnapshot: JiraDeliverySnapshot = {
    syncedAt,
    dataQualityFlags: dataQualityFlags.length > 0 ? dataQualityFlags : undefined,
    projects,
  };

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
    releaseTracking: effectiveMapping?.jira?.releaseTracking,
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

  await upsertSprintReleases(
    input.organizationId,
    projects,
    effectiveMapping?.jira?.releaseTracking,
  );

  await upsertFixVersionReleases(
    input.organizationId,
    projects,
    effectiveMapping?.jira?.releaseTracking,
  );

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
      actorType: determineActorType(input.userId, "integration.jira.synced"),
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

async function resolveSprintIssuesAndCounts(input: {
  accessToken: string;
  cloudId: string;
  sprint: { id: number; name: string; state: string; startDate?: string; endDate?: string };
  mapping: JiraMappingSlice;
  storyPointFieldId?: string;
  jqlPartialFailures: string[];
}): Promise<{
  committed: number;
  done: number | undefined;
  sprintStatusByName: Record<string, number> | undefined;
  storyPoints: { committed: number; done: number; unestimatedIssues: number } | undefined;
  sprintQaCount: number | undefined;
  sprintAssigneeWorkload: Array<{ assignee: string; openCount: number }> | undefined;
  sprintIssues: Awaited<ReturnType<typeof fetchAllSprintIssues>>;
}> {
  let sprintIssues: Awaited<ReturnType<typeof fetchAllSprintIssues>> = [];
  try {
    sprintIssues = await fetchAllSprintIssues(
      input.accessToken,
      input.cloudId,
      input.sprint.id,
      input.storyPointFieldId,
    );
  } catch (e) {
    if (e instanceof JiraApiError && [400, 401, 403, 404, 429].includes(e.status)) {
      recordJqlFailure(input.jqlPartialFailures, "sprint_issues");
    } else {
      throw e;
    }
  }

  let committed = sprintIssues.length;
  let done: number | undefined = sprintIssues.length > 0 ? undefined : 0;
  let sprintStatusByName: Record<string, number> | undefined;
  let storyPoints:
    | { committed: number; done: number; unestimatedIssues: number }
    | undefined;
  let sprintQaCount: number | undefined;
  let sprintAssigneeWorkload:
    | Array<{ assignee: string; openCount: number }>
    | undefined;

  if (sprintIssues.length > 0) {
    const aggregates = aggregateSprintIssues(sprintIssues, input.mapping);
    committed = aggregates.committed;
    done = aggregates.done;
    sprintStatusByName = aggregates.statusByName;
    storyPoints = aggregates.storyPoints;
    sprintQaCount = aggregates.qaPipelineCount;
    sprintAssigneeWorkload = aggregates.assigneeWorkload;
  } else {
    try {
      [committed, done] = await Promise.all([
        countIssuesByJql(input.accessToken, input.cloudId, `sprint = ${input.sprint.id}`),
        countIssuesByJql(
          input.accessToken,
          input.cloudId,
          buildSprintDoneJql(input.sprint.id, input.mapping),
        ),
      ]);
    } catch (e) {
      if (e instanceof JiraApiError && [400, 401, 403, 404, 429].includes(e.status)) {
        recordJqlFailure(input.jqlPartialFailures, "sprint_counts");
      } else {
        throw e;
      }
    }
  }

  return {
    committed,
    done,
    sprintStatusByName,
    storyPoints,
    sprintQaCount,
    sprintAssigneeWorkload,
    sprintIssues,
  };
}
