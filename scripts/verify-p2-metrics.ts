/**
 * Verify P2 metric modules against live Connexus Sprint 35.
 * Run: npx tsx scripts/verify-p2-metrics.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  fetchAllSprintIssues,
  listBoardsForProject,
  listBoardSprints,
  resolveJiraAccessToken,
} from "../src/lib/jira-api";
import { parseJiraMeta } from "../src/lib/jira-meta";
import {
  resolveEffectiveToolchainMapping,
  resolveJiraMappingForProject,
} from "../src/lib/toolchain-mapping";
import { LEGACY_JIRA_MAPPING } from "../src/lib/jira-jql";
import { aggregateSprintIssues, sprintDaysOverdue } from "../src/lib/jira-sprint-metrics";
import { resolveSpilloverCount } from "../src/lib/jira-spillover";
import { analyzePortfolioDeliveryHealth } from "../src/lib/jira-delivery-health";
import type { JiraDeliverySnapshot } from "../src/lib/jira-meta";

const SPRINT_ID = 807;
const PROJECT_KEY = "CX";

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "connexus" } });
  if (!org) throw new Error("connexus org not found");

  const integration = await prisma.integration.findUnique({
    where: { organizationId_provider: { organizationId: org.id, provider: "JIRA" } },
  });
  if (!integration) throw new Error("JIRA integration not found");

  const { accessToken, cloudId } = await resolveJiraAccessToken(integration);
  const mapping = await resolveEffectiveToolchainMapping(org.id);
  const projectMapping = mapping
    ? resolveJiraMappingForProject(mapping, PROJECT_KEY)
    : undefined;
  const jiraMapping = mapping?.jira
    ? {
        blockedStatusName: mapping.jira.blockedStatusName,
        bugIssueType: mapping.jira.bugIssueType,
        doneStatusCategory: mapping.jira.doneStatusCategory,
        doneStatusNames: mapping.jira.doneStatusNames,
      }
    : LEGACY_JIRA_MAPPING;

  const boards = await listBoardsForProject(accessToken, cloudId, PROJECT_KEY);
  const board = boards[0];
  const sprints = board ? await listBoardSprints(accessToken, cloudId, board.id) : [];
  const sprint = sprints.find((s) => s.id === SPRINT_ID) ?? sprints.find((s) => s.state === "active");

  if (!sprint) throw new Error("Sprint 35 not found");

  const issues = await fetchAllSprintIssues(
    accessToken,
    cloudId,
    sprint.id,
    projectMapping?.storyPointField?.id,
  );

  const aggregates = aggregateSprintIssues(issues, jiraMapping);
  const spillover = await resolveSpilloverCount(accessToken, cloudId, {
    sprintId: sprint.id,
    sprintStartDate: sprint.startDate,
    sprintName: sprint.name,
    boardId: board?.id,
    mapping: jiraMapping,
    sprintIssues: issues,
    useChangelog: true,
  });

  const daysOverdue = sprintDaysOverdue(sprint.endDate);

  const snapshot: JiraDeliverySnapshot = {
    syncedAt: new Date().toISOString(),
    projects: [
      {
        key: PROJECT_KEY,
        name: "Connexus",
        openIssues: aggregates.open,
        blockedCount: 0,
        overdueCount: 0,
        spilloverCount: spillover.count,
        bugsOpen: 0,
        unassignedCount: 0,
        qaPipelineCount: aggregates.qaPipelineCount,
        assigneeWorkload: aggregates.assigneeWorkload,
        versions: [],
        activeSprint: {
          id: sprint.id,
          name: sprint.name,
          state: sprint.state,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          committed: aggregates.committed,
          done: aggregates.done,
          statusByName: aggregates.statusByName,
          storyPoints: aggregates.storyPoints,
          qaPipelineCount: aggregates.qaPipelineCount,
          daysOverdue: daysOverdue > 0 ? daysOverdue : undefined,
        },
      },
    ],
  };

  const health = analyzePortfolioDeliveryHealth({
    snapshot,
    projectKey: PROJECT_KEY,
    mapping: mapping?.jira,
  });

  const report = {
    sprint: { id: sprint.id, name: sprint.name, endDate: sprint.endDate },
    metrics: {
      committed: aggregates.committed,
      done: aggregates.done,
      donePct: Math.round((aggregates.done / aggregates.committed) * 100),
      qaPipeline: aggregates.qaPipelineCount,
      spillover: spillover.count,
      spilloverMethod: spillover.method,
      daysOverdue,
      storyPoints: aggregates.storyPoints,
      statusByName: aggregates.statusByName,
      topAssignee: aggregates.assigneeWorkload[0],
    },
    signals: health.signals
      .filter((s) =>
        ["sprint-overdue-CX", "qa-pipeline-CX", "assignee-load-CX", "sprint-CX", "spillover"].includes(
          s.id,
        ),
      )
      .map((s) => ({ id: s.id, value: s.value, severity: s.severity })),
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
