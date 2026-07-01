/** Jira JQL fragments built from confirmed toolchain mapping (Phase 2). */

export type JiraMappingSlice = {
  blockedStatusName: string;
  bugIssueType: string;
  doneStatusCategory: "Done" | "Complete" | "Closed";
  doneStatusNames?: string[];
};

export const LEGACY_JIRA_MAPPING: JiraMappingSlice = {
  blockedStatusName: "Blocked",
  bugIssueType: "Bug",
  doneStatusCategory: "Done",
};

export function jqlQuoteLiteral(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildNotDoneJql(mapping: JiraMappingSlice): string {
  return `statusCategory != ${jqlQuoteLiteral(mapping.doneStatusCategory)}`;
}

export function buildBlockedJql(baseJql: string, mapping: JiraMappingSlice): string {
  return `${baseJql} AND (status = ${jqlQuoteLiteral(mapping.blockedStatusName)} OR labels = blocked) AND ${buildNotDoneJql(mapping)}`;
}

export function buildBugJql(baseJql: string, mapping: JiraMappingSlice): string {
  return `${baseJql} AND issuetype = ${jqlQuoteLiteral(mapping.bugIssueType)} AND ${buildNotDoneJql(mapping)}`;
}

export function buildOpenJql(baseJql: string, mapping: JiraMappingSlice): string {
  return `${baseJql} AND ${buildNotDoneJql(mapping)}`;
}

export function buildDoneJql(baseJql: string, mapping: JiraMappingSlice): string {
  return `${baseJql} AND statusCategory = ${jqlQuoteLiteral(mapping.doneStatusCategory)}`;
}

/** Issues currently not-done that were previously in an explicit done status. */
export function buildReopenedJql(baseJql: string, mapping: JiraMappingSlice): string | null {
  const doneNames = mapping.doneStatusNames?.filter((name) => name.trim().length > 0);
  if (!doneNames || doneNames.length === 0) return null;
  const fromClause = doneNames.map((name) => jqlQuoteLiteral(name)).join(", ");
  return `${baseJql} AND status CHANGED FROM (${fromClause}) AND ${buildNotDoneJql(mapping)}`;
}

/** Issues in the active sprint that also belonged to a closed sprint (carried over). */
export function buildSpilloverJql(sprintId: number): string {
  return `sprint = ${sprintId} AND sprint in closedSprints()`;
}

/** Portfolio spillover when no single active sprint id is in scope. */
export function buildPortfolioSpilloverJql(baseJql: string): string {
  return `${baseJql} AND sprint in openSprints() AND sprint in closedSprints()`;
}

/** Open issues created more than 30 days ago (aged backlog). */
export function buildStaleOpenJql(baseJql: string, mapping: JiraMappingSlice): string {
  return `${baseJql} AND ${buildNotDoneJql(mapping)} AND created <= -30d`;
}

/** Open issues in non-standard status categories (outside To Do / In Progress). */
export function buildUnknownWorkflowStatusJql(
  baseJql: string,
  mapping: JiraMappingSlice,
): string {
  return `${baseJql} AND ${buildNotDoneJql(mapping)} AND statusCategory NOT IN ("To Do", "In Progress") AND status != ${jqlQuoteLiteral(mapping.blockedStatusName)}`;
}
