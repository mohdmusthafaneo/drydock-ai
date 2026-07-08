/** Jira JQL fragments built from confirmed toolchain mapping (Phase 2). */

import type { ReleaseScope } from "@/lib/release-scope";

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

/**
 * Done counting semantics (Connexus Sprint 35 reference):
 * - `status = Done` (calibrated doneStatusNames): counts issues in the team's terminal workflow
 *   status by name — ground-truth report uses this (49 Done).
 * - `statusCategory = Done`: Jira category rollup — can include statuses mapped to Done
 *   category but not named "Done" (52 on Connexus board).
 * Prefer calibrated `doneStatusNames` when present; fall back to `doneStatusCategory`.
 */

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

/** Done issues — prefers calibrated status names over statusCategory. */
export function buildDoneJql(baseJql: string, mapping: JiraMappingSlice): string {
  const doneNames = mapping.doneStatusNames?.filter((name) => name.trim().length > 0);
  if (doneNames && doneNames.length > 0) {
    const inClause = doneNames.map((name) => jqlQuoteLiteral(name)).join(", ");
    return `${baseJql} AND status IN (${inClause})`;
  }
  return `${baseJql} AND statusCategory = ${jqlQuoteLiteral(mapping.doneStatusCategory)}`;
}

/** Sprint-scoped done count aligned with calibrated workflow. */
export function buildSprintDoneJql(sprintId: number, mapping: JiraMappingSlice): string {
  return buildDoneJql(`sprint = ${sprintId}`, mapping);
}

export function buildSprintOpenJql(sprintId: number, mapping: JiraMappingSlice): string {
  return buildOpenJql(`sprint = ${sprintId}`, mapping);
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

/** Open issues in sprint that also appear in a closed sprint. */
export function buildMultiSprintSpilloverJql(
  sprintId: number,
  mapping: JiraMappingSlice,
): string {
  return `${buildSpilloverJql(sprintId)} AND ${buildNotDoneJql(mapping)}`;
}

/**
 * Carry-over heuristic: open sprint issues created before the sprint started
 * (bulk reassignment / inherited backlog — Connexus Sprint 34 → 35).
 */
export function buildCarryOverSpilloverJql(
  sprintId: number,
  sprintStartDate: string,
  mapping: JiraMappingSlice,
): string {
  const startDay = sprintStartDate.slice(0, 10);
  return `sprint = ${sprintId} AND ${buildNotDoneJql(mapping)} AND created < ${jqlQuoteLiteral(startDay)}`;
}

/** Portfolio spillover when no single active sprint id is in scope. */
export function buildPortfolioSpilloverJql(baseJql: string): string {
  return `${baseJql} AND sprint in openSprints() AND sprint in closedSprints()`;
}

/** QA / review pipeline — open issues in testing statuses within scope. */
export function buildQaPipelineJql(
  baseJql: string,
  qaStatusNames: string[],
  mapping: JiraMappingSlice,
): string | null {
  const names = qaStatusNames.filter((n) => n.trim().length > 0);
  if (names.length === 0) return null;
  const inClause = names.map((name) => jqlQuoteLiteral(name)).join(", ");
  return `${baseJql} AND status IN (${inClause}) AND ${buildNotDoneJql(mapping)}`;
}

export function buildSprintQaPipelineJql(
  sprintId: number,
  qaStatusNames: string[],
  mapping: JiraMappingSlice,
): string | null {
  return buildQaPipelineJql(`sprint = ${sprintId}`, qaStatusNames, mapping);
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

/** Base JQL clause for a sprint or fix-version release scope. */
export function buildReleaseScopeJql(scope: ReleaseScope): string {
  if (scope.mode === "sprint") {
    return `sprint = ${scope.sprintId}`;
  }
  return `fixVersion = ${jqlQuoteLiteral(scope.versionName)}`;
}

/** Scope-aware overdue JQL (sprint or fix version). */
export function buildScopedOverdueJql(
  scope: ReleaseScope,
  mapping: JiraMappingSlice,
): string {
  return `${buildReleaseScopeJql(scope)} AND duedate < now() AND ${buildNotDoneJql(mapping)}`;
}

export function buildScopedBlockedJql(
  scope: ReleaseScope,
  mapping: JiraMappingSlice,
): string {
  return buildBlockedJql(buildReleaseScopeJql(scope), mapping);
}

export function buildScopedBugJql(scope: ReleaseScope, mapping: JiraMappingSlice): string {
  return buildBugJql(buildReleaseScopeJql(scope), mapping);
}

export function buildScopedOpenJql(scope: ReleaseScope, mapping: JiraMappingSlice): string {
  return buildOpenJql(buildReleaseScopeJql(scope), mapping);
}

export function buildScopedReopenedJql(
  scope: ReleaseScope,
  mapping: JiraMappingSlice,
): string | null {
  return buildReopenedJql(buildReleaseScopeJql(scope), mapping);
}

export function buildScopedSpilloverJql(
  scope: ReleaseScope,
  mapping: JiraMappingSlice,
): string | null {
  if (scope.mode !== "sprint") return null;
  return buildMultiSprintSpilloverJql(scope.sprintId, mapping);
}
