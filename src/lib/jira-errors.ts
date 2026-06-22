export const JIRA_RECONNECT_MESSAGE =
  "Jira authorization expired or was revoked. Disconnect and reconnect Jira on this page to restore sync.";

function jiraErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isJiraReconnectError(err: unknown): boolean {
  const lower = jiraErrorMessage(err).toLowerCase();
  return (
    (lower.includes("refresh_token") && lower.includes("invalid")) ||
    lower.includes("reconnect via oauth") ||
    lower.includes("token missing") ||
    lower.includes("access token expired") ||
    lower.includes("token refresh failed")
  );
}

export function isJiraReconnectMessage(message: string): boolean {
  return message === JIRA_RECONNECT_MESSAGE || isJiraReconnectError(new Error(message));
}
