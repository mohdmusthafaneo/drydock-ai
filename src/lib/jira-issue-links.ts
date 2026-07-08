import {
  buildBlockedJql,
  buildBugJql,
  buildNotDoneJql,
  buildOpenJql,
  buildPortfolioSpilloverJql,
  buildReopenedJql,
  buildReleaseScopeJql,
  buildScopedBlockedJql,
  buildScopedOpenJql,
  buildScopedOverdueJql,
  buildSpilloverJql,
  buildStaleOpenJql,
  buildUnknownWorkflowStatusJql,
  jqlQuoteLiteral,
  type JiraMappingSlice,
} from "@/lib/jira-jql";
import type { ReleaseScope } from "@/lib/release-scope";
import {
  resolveJiraMappingForProject,
  type ToolchainMapping,
} from "@/lib/toolchain-mapping";

export type JiraLinkContext = {
  siteUrl: string;
  mapping: ToolchainMapping;
  projectKeys: string[];
  /** When set, KPI and signal links use sprint/fix-version scope instead of project backlog. */
  releaseScope?: {
    mode: "sprint" | "fixVersion";
    scopeLabel?: string;
    projectKey?: string;
    sprintId?: number;
    versionName?: string;
  };
};

export type SignalLinkExtras = {
  versionName?: string;
  sprintId?: number;
  projectKey?: string;
};

export type KpiLinkKey = "openWork" | "blocked" | "overdue";

export function buildJiraIssuesSearchUrl(siteUrl: string, jql: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/issues/?jql=${encodeURIComponent(jql)}`;
}

export function buildProjectScopeClause(projectKeys: string[]): string {
  if (projectKeys.length === 0) return "";
  if (projectKeys.length === 1) return `project = ${jqlQuoteLiteral(projectKeys[0])}`;
  const quoted = projectKeys.map((k) => jqlQuoteLiteral(k)).join(", ");
  return `project in (${quoted})`;
}

export function mappingSliceFromJira(
  jira: NonNullable<ToolchainMapping["jira"]>,
): JiraMappingSlice {
  return {
    blockedStatusName: jira.blockedStatusName,
    bugIssueType: jira.bugIssueType,
    doneStatusCategory: jira.doneStatusCategory,
    doneStatusNames: jira.doneStatusNames,
  };
}

function resolveMappingSlice(
  ctx: JiraLinkContext,
  projectKey?: string,
): JiraMappingSlice | null {
  const jira = projectKey
    ? resolveJiraMappingForProject(ctx.mapping, projectKey)
    : ctx.mapping.jira;
  if (!jira) return null;
  return mappingSliceFromJira(jira);
}

function baseJqlForScope(ctx: JiraLinkContext, projectKey?: string): string | null {
  const keys = projectKey ? [projectKey] : ctx.projectKeys;
  if (keys.length === 0) return null;
  return buildProjectScopeClause(keys);
}

export function buildOverdueJql(baseJql: string, mapping: JiraMappingSlice): string {
  return `${baseJql} AND duedate < now() AND ${buildNotDoneJql(mapping)}`;
}

export function buildUnassignedJql(baseJql: string, mapping: JiraMappingSlice): string {
  return `${baseJql} AND assignee is EMPTY AND ${buildNotDoneJql(mapping)}`;
}

export function buildMissingEstimatesJql(
  baseJql: string,
  mapping: JiraMappingSlice,
  fieldId: string,
): string {
  return `${baseJql} AND ${buildNotDoneJql(mapping)} AND ${fieldId} is EMPTY`;
}

export function buildMissingDueDateJql(baseJql: string): string {
  return `${baseJql} AND statusCategory = "In Progress" AND duedate is EMPTY`;
}

export function buildFixVersionJql(
  baseJql: string,
  versionName: string,
  mapping: JiraMappingSlice,
): string {
  return `${baseJql} AND fixVersion = ${jqlQuoteLiteral(versionName)} AND ${buildNotDoneJql(mapping)}`;
}

export function buildFixVersionUnusedJql(
  baseJql: string,
  mapping: JiraMappingSlice,
): string {
  return `${baseJql} AND fixVersion is EMPTY AND ${buildNotDoneJql(mapping)}`;
}

export function buildSprintJql(sprintId: number): string {
  return `sprint = ${sprintId}`;
}

function resolveReleaseScopeFromContext(ctx: JiraLinkContext): ReleaseScope | null {
  const rs = ctx.releaseScope;
  if (!rs?.projectKey) return null;
  if (rs.mode === "sprint" && rs.sprintId != null) {
    return {
      mode: "sprint",
      projectKey: rs.projectKey,
      sprintId: rs.sprintId,
      sprintName: rs.scopeLabel ?? `Sprint ${rs.sprintId}`,
    };
  }
  if (rs.mode === "fixVersion" && rs.versionName) {
    return {
      mode: "fixVersion",
      projectKey: rs.projectKey,
      versionId: rs.versionName,
      versionName: rs.versionName,
    };
  }
  return null;
}

export function jqlForKpi(kpi: KpiLinkKey, ctx: JiraLinkContext): string | null {
  const scope = resolveReleaseScopeFromContext(ctx);
  const mapping = resolveMappingSlice(ctx, scope?.projectKey ?? ctx.projectKeys[0]);
  if (!mapping) return null;

  if (scope) {
    switch (kpi) {
      case "openWork":
        return buildScopedOpenJql(scope, mapping);
      case "blocked":
        return buildScopedBlockedJql(scope, mapping);
      case "overdue":
        return buildScopedOverdueJql(scope, mapping);
      default:
        return null;
    }
  }

  const base = baseJqlForScope(ctx);
  if (!base) return null;

  switch (kpi) {
    case "openWork":
      return buildOpenJql(base, mapping);
    case "blocked":
      return buildBlockedJql(base, mapping);
    case "overdue":
      return buildOverdueJql(base, mapping);
    default:
      return null;
  }
}

export function jqlForSignal(
  signalId: string,
  ctx: JiraLinkContext,
  extras?: SignalLinkExtras,
): string | null {
  const projectKey = extras?.projectKey ?? (signalId.startsWith("sprint-") ? signalId.slice(7) : undefined);
  const base = baseJqlForScope(ctx, projectKey);
  const mapping = resolveMappingSlice(ctx, projectKey);
  if (!base || !mapping) return null;

  if (signalId === "portfolio-blocked" || signalId === "jira-blocked") {
    const scope = resolveReleaseScopeFromContext(ctx);
    if (scope) return buildScopedBlockedJql(scope, mapping);
    return buildBlockedJql(base, mapping);
  }
  if (signalId === "overdue-cluster" || signalId === "jira-overdue") {
    const scope = resolveReleaseScopeFromContext(ctx);
    if (scope) return buildScopedOverdueJql(scope, mapping);
    return buildOverdueJql(base, mapping);
  }
  if (signalId === "bug-backlog" || signalId === "jira-bugs") {
    const scope = resolveReleaseScopeFromContext(ctx);
    if (scope) return buildBugJql(buildReleaseScopeJql(scope), mapping);
    return buildBugJql(base, mapping);
  }
  if (
    signalId === "jira-fix-version" ||
    signalId === "jira-version-open" ||
    signalId === "version-slip"
  ) {
    if (!extras?.versionName) return null;
    return buildFixVersionJql(base, extras.versionName, mapping);
  }
  if (signalId === "jira-sprint" || signalId.startsWith("sprint-")) {
    if (extras?.sprintId == null) return null;
    return buildSprintJql(extras.sprintId);
  }
  if (signalId === "reopened-cluster" || signalId === "jira-reopened") {
    return buildReopenedJql(base, mapping);
  }
  if (signalId === "spillover" || signalId === "jira-spillover") {
    if (extras?.sprintId != null) {
      return buildSpilloverJql(extras.sprintId);
    }
    return buildPortfolioSpilloverJql(base);
  }
  return null;
}

export function jqlForHygieneFinding(
  findingId: string,
  projectKey: string,
  ctx: JiraLinkContext,
): string | null {
  const base = baseJqlForScope(ctx, projectKey);
  const jira = resolveJiraMappingForProject(ctx.mapping, projectKey);
  const mapping = jira ? mappingSliceFromJira(jira) : null;
  if (!base || !mapping) return null;

  switch (findingId) {
    case "high-unassigned":
      return buildUnassignedJql(base, mapping);
    case "high-overdue":
      return buildOverdueJql(base, mapping);
    case "missing-estimates": {
      const fieldId = jira?.storyPointField?.id;
      if (!fieldId) return null;
      return buildMissingEstimatesJql(base, mapping, fieldId);
    }
    case "missing-due-dates":
      return buildMissingDueDateJql(base);
    case "aged-open-tickets":
      return buildStaleOpenJql(base, mapping);
    case "unknown-status-vs-workflow":
      return buildUnknownWorkflowStatusJql(base, mapping);
    case "fixversion-not-used":
      return buildFixVersionUnusedJql(base, mapping);
    case "scrum-no-sprint":
      return buildOpenJql(base, mapping);
    default:
      return null;
  }
}

export function jiraUrlForKpi(kpi: KpiLinkKey, ctx: JiraLinkContext): string | undefined {
  const jql = jqlForKpi(kpi, ctx);
  return jql ? buildJiraIssuesSearchUrl(ctx.siteUrl, jql) : undefined;
}

export function jiraUrlForSignal(
  signalId: string,
  ctx: JiraLinkContext,
  extras?: SignalLinkExtras,
): string | undefined {
  const jql = jqlForSignal(signalId, ctx, extras);
  return jql ? buildJiraIssuesSearchUrl(ctx.siteUrl, jql) : undefined;
}

export function jiraUrlForHygieneFinding(
  findingId: string,
  projectKey: string,
  ctx: JiraLinkContext,
): string | undefined {
  const jql = jqlForHygieneFinding(findingId, projectKey, ctx);
  return jql ? buildJiraIssuesSearchUrl(ctx.siteUrl, jql) : undefined;
}

export function jiraUrlForFixVersion(
  projectKey: string,
  versionName: string,
  ctx: JiraLinkContext,
): string | undefined {
  const base = baseJqlForScope(ctx, projectKey);
  const mapping = resolveMappingSlice(ctx, projectKey);
  if (!base || !mapping) return undefined;
  return buildJiraIssuesSearchUrl(ctx.siteUrl, buildFixVersionJql(base, versionName, mapping));
}

export function buildJiraHygieneLinksMap(
  ctx: JiraLinkContext,
  byProject: Record<string, { findings: Array<{ id: string }> }>,
): Record<string, string> {
  const links: Record<string, string> = {};
  for (const [projectKey, result] of Object.entries(byProject)) {
    for (const finding of result.findings) {
      const url = jiraUrlForHygieneFinding(finding.id, projectKey, ctx);
      if (url) links[`${projectKey}:${finding.id}`] = url;
    }
  }
  return links;
}
