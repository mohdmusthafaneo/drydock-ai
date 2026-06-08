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
