/**
 * Public barrel for the Jira API client.
 * Call sites continue to import from `@/lib/jira-api`.
 */

export { JiraApiError } from "@/lib/jira-api/client";

export {
  JIRA_RECONNECT_MESSAGE,
  isJiraReconnectError,
  isJiraReconnectMessage,
  isJiraScopeError,
  formatJiraSyncError,
} from "@/lib/jira-api/errors";

export {
  buildJiraOAuthMeta,
  probeJiraConnection,
  applyJiraMetaPatch,
  resolveJiraAccessToken,
  recordJiraIntegrationFailure,
} from "@/lib/jira-api/connection";

export { getJiraAccessToken, getJiraRefreshToken } from "@/lib/jira-tokens";

export type {
  JiraProjectSummary,
  JiraVersionSummary,
  JiraBoardSummary,
  JiraSprintSummary,
  JiraFieldSummary,
  JiraIssueTypeSummary,
  JiraStatusSummary,
} from "@/lib/jira-api/catalog";

export {
  listJiraProjects,
  getJiraProject,
  listProjectVersions,
  listBoardsForProject,
  listBoardSprints,
  countIssuesByJql,
  listJiraFields,
  listJiraIssueTypes,
  listProjectStatuses,
} from "@/lib/jira-api/catalog";

export type {
  JiraIssueSummary,
  JiraIssueSearchResult,
  JiraIssueWithDescription,
} from "@/lib/jira-api/search";

export {
  searchIssuesByJql,
  searchIssuesWithDescriptions,
} from "@/lib/jira-api/search";

export type {
  JiraCalibrationIssueRaw,
  JiraCalibrationIssueSearchResult,
} from "@/lib/jira-api/calibration";

export { searchCalibrationIssuesByJql } from "@/lib/jira-api/calibration";

export type {
  JiraSprintIssue,
  JiraSprintChangelogEntry,
} from "@/lib/jira-api/sprint";

export {
  fetchAllSprintIssues,
  fetchIssueSprintChangelog,
} from "@/lib/jira-api/sprint";
