import type { Integration } from "@/generated/prisma/client";

export type JiraSiteSummary = {
  cloudId: string;
  siteUrl: string;
  siteName?: string;
};

/** Status flow counts from JQL at sync (P2b). */
export type JiraStatusBreakdown = {
  todo: number;
  inProgress: number;
  done: number;
};

/** Stored in metadataJson after PR2 sync */
export type JiraDeliverySnapshot = {
  syncedAt: string;
  projects: Array<{
    key: string;
    name: string;
    openIssues: number;
    blockedCount: number;
    overdueCount: number;
    bugsOpen: number;
    unassignedCount: number;
    /** Open issues with empty story-point field (hygiene). */
    missingEstimateCount?: number;
    /** In-progress issues with no due date (hygiene). */
    missingDueDateCount?: number;
    /** Issues resolved in the last 7 days (P2b). */
    resolvedLast7d?: number;
    /** To Do / In Progress / Done category counts (P2b). */
    statusBreakdown?: JiraStatusBreakdown;
    versions: Array<{
      id: string;
      name: string;
      released: boolean;
      releaseDate?: string;
      overdue?: boolean;
      /** Open issues with this fix version (P2b; capped versions per sync). */
      openIssuesInVersion?: number;
    }>;
    board?: { id: number; name: string; type: string };
    activeSprint?: {
      id: number;
      name: string;
      state: string;
      startDate?: string;
      endDate?: string;
      committed?: number;
      done?: number;
    };
  }>;
};

export type JiraFieldRef = {
  id: string;
  name: string;
  schemaType?: string;
};

export type JiraSchemaSnapshot = {
  syncedAt: string;
  projectKeys: string[];
  issueTypes: Array<{ id: string; name: string; subtask: boolean; scope?: string }>;
  statuses: Array<{
    id: string;
    name: string;
    statusCategory: { key: string; name: string };
    scope?: { projectKey?: string; projectName?: string };
  }>;
  fields: Array<{
    id: string;
    name: string;
    custom: boolean;
    schema?: { type: string; custom?: string };
    projectKeys?: string[];
  }>;
  suggestions: {
    blockedStatus?: { name: string; id: string; reason: string; confidence: number };
    bugIssueType?: { name: string; id: string; reason: string; confidence: number };
    storyPointField?: { id: string; name: string; reason: string; confidence: number };
    releaseTracking?: {
      mode: "fixVersion" | "sprint" | "labels" | "none";
      reason: string;
    };
  };
};

export type JiraIntegrationMeta = {
  mode: "oauth-readonly";
  cloudId: string;
  siteUrl: string;
  siteName?: string;
  accountId?: string;
  displayName?: string;
  scopes?: string;
  accessTokenEnc: string;
  refreshTokenEnc?: string;
  connectedBy: string;
  availableSites?: JiraSiteSummary[];
  lastConnectionCheckAt?: string;
  connectionStatus?: "ok" | "error";
  lastError?: string;
  projectKeys?: string[];
  lastSyncSummary?: string;
  deliverySnapshot?: JiraDeliverySnapshot;
  jiraSchemaSnapshot?: JiraSchemaSnapshot;
  connectedVia?: "session" | "external_link";
  externalConnector?: { displayName?: string; accountId?: string };
  /** Latest computed rollup summary (compat when Prisma history unavailable). */
  deliveryAnalysisSnapshot?: {
    generatedAt: string;
    healthScore: number;
    openWork: number;
    projectKeys: string[];
  };
  /** Computed Jira board hygiene rollup (Point 5). */
  jiraHygiene?: import("@/lib/jira-hygiene").JiraHygieneSnapshot;
};

export function parseJiraMeta(metadataJson: string): Partial<JiraIntegrationMeta> {
  try {
    return JSON.parse(metadataJson) as Partial<JiraIntegrationMeta>;
  } catch {
    return {};
  }
}

export function mergeJiraMeta(
  existing: Partial<JiraIntegrationMeta>,
  patch: Partial<JiraIntegrationMeta>,
): string {
  return JSON.stringify({ ...existing, ...patch });
}

export function isJiraOAuthConnected(integration: Integration): boolean {
  if (integration.provider !== "JIRA" || integration.status !== "CONNECTED") {
    return false;
  }
  const meta = parseJiraMeta(integration.metadataJson);
  return Boolean(meta.cloudId && meta.accessTokenEnc && meta.mode === "oauth-readonly");
}
