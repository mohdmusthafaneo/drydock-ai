import {
  isJiraReconnectError,
  JIRA_RECONNECT_MESSAGE,
} from "@/lib/jira-errors";
import { JiraApiError } from "@/lib/jira-api/client";

export { JIRA_RECONNECT_MESSAGE, isJiraReconnectError, isJiraReconnectMessage } from "@/lib/jira-errors";

function jiraErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isJiraScopeError(err: unknown): boolean {
  if (!(err instanceof JiraApiError) || err.status !== 401) return false;
  const lower = jiraErrorMessage(err).toLowerCase();
  return lower.includes("scope") || lower.includes("unauthorized");
}

function parseJiraErrorBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    if (parsed.message) return parsed.message;
  } catch {
    // not JSON
  }
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}

export function formatJiraSyncError(err: unknown): string {
  if (err instanceof JiraApiError && err.status === 410) {
    return "Jira search API was updated by Atlassian. Restart the dev server and sync again.";
  }
  if (isJiraReconnectError(err)) {
    return JIRA_RECONNECT_MESSAGE;
  }
  if (isJiraScopeError(err)) {
    return (
      "Jira OAuth scopes are insufficient for sync. In the Atlassian developer console, enable " +
      "read:jira-work, read:project:jira, read:board-scope:jira-software, and read:sprint:jira-software " +
      "for your app, then disconnect and reconnect Jira here."
    );
  }
  if (err instanceof JiraApiError) {
    return `Jira API error (${err.status}): ${parseJiraErrorBody(err.message)}`;
  }
  return err instanceof Error ? err.message : "Sync failed";
}
