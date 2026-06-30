import {
  countIssuesByJql,
  JiraApiError,
  resolveJiraAccessToken,
  searchCalibrationIssuesByJql,
} from "@/lib/jira-api";
import { buildPortfolioSpilloverJql } from "@/lib/jira-jql";
import { mergeJiraMeta, parseJiraMeta } from "@/lib/jira-meta";
import { prisma } from "@/lib/prisma";
import type { CalibrationIssueSample, CalibrationSample } from "@/lib/jira-calibration/types";

const DEFAULT_WINDOW_DAYS = 90;
const MAX_ISSUES = 500;
const PAGE_SIZE = 50;
const MAX_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCalibrationJql(projectKey: string, windowDays: number): string {
  return `project = ${projectKey} AND updated >= -${windowDays}d ORDER BY updated DESC`;
}

function toIssueSample(issue: {
  key: string;
  status: string;
  issueType: string;
  created?: string;
  resolutionDate?: string;
  labels: string[];
  fixVersions: string[];
  assignee?: string;
  dueDate?: string;
  transitions: Array<{ from?: string; to: string; at: string }>;
}): CalibrationIssueSample {
  return {
    key: issue.key,
    status: issue.status,
    issueType: issue.issueType,
    created: issue.created,
    resolutionDate: issue.resolutionDate,
    labels: issue.labels,
    fixVersions: issue.fixVersions,
    assignee: issue.assignee,
    dueDate: issue.dueDate,
    transitions: issue.transitions,
  };
}

async function fetchPageWithBackoff(
  accessToken: string,
  cloudId: string,
  jql: string,
  nextPageToken?: string,
): Promise<{ issues: CalibrationIssueSample[]; nextPageToken?: string }> {
  let attempt = 0;
  while (true) {
    try {
      const page = await searchCalibrationIssuesByJql(accessToken, cloudId, {
        jql,
        maxResults: PAGE_SIZE,
        nextPageToken,
      });
      return {
        issues: page.issues.map(toIssueSample),
        nextPageToken: page.nextPageToken,
      };
    } catch (err) {
      if (err instanceof JiraApiError && err.status === 429 && attempt < MAX_RETRIES) {
        attempt += 1;
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
}

/** Pull a capped 90-day issue+changelog sample for calibration (no DB issue storage). */
export async function fetchJiraCalibrationSample(input: {
  organizationId: string;
  projectKey: string;
  windowDays?: number;
}): Promise<CalibrationSample> {
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: { organizationId: input.organizationId, provider: "JIRA" },
    },
  });
  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("Jira is not connected");
  }

  const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);
  if (metaPatch) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        metadataJson: mergeJiraMeta(parseJiraMeta(integration.metadataJson), metaPatch),
      },
    });
  }

  const jql = buildCalibrationJql(input.projectKey, windowDays);
  const issues: CalibrationIssueSample[] = [];
  let nextPageToken: string | undefined;
  let capped = false;

  const totalInWindow = await countIssuesByJql(accessToken, cloudId, jql).catch(() => undefined);

  while (issues.length < MAX_ISSUES) {
    const page = await fetchPageWithBackoff(accessToken, cloudId, jql, nextPageToken);
    issues.push(...page.issues);
    if (!page.nextPageToken || page.issues.length === 0) break;
    nextPageToken = page.nextPageToken;
    if (issues.length >= MAX_ISSUES) {
      capped = true;
      break;
    }
  }

  const baseJql = `project = ${input.projectKey}`;
  let spilloverCount: number | undefined;
  try {
    spilloverCount = await countIssuesByJql(
      accessToken,
      cloudId,
      buildPortfolioSpilloverJql(baseJql),
    );
  } catch {
    spilloverCount = undefined;
  }

  let closedSprintCount: number | undefined;
  try {
    closedSprintCount = await countIssuesByJql(
      accessToken,
      cloudId,
      `${baseJql} AND sprint in closedSprints()`,
    );
  } catch {
    closedSprintCount = undefined;
  }

  return {
    projectKey: input.projectKey,
    windowDays,
    fetchedAt: new Date().toISOString(),
    issueCount: issues.length,
    capped,
    issues: issues.slice(0, MAX_ISSUES),
    aggregates: {
      totalInWindow,
      spilloverCount,
      closedSprintCount,
    },
  };
}
