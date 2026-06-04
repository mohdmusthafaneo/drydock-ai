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
  /** Latest computed rollup summary (compat when Prisma history unavailable). */
  deliveryAnalysisSnapshot?: {
    generatedAt: string;
    healthScore: number;
    openWork: number;
    projectKeys: string[];
  };
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
