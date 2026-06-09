import { prisma } from "@/lib/prisma";
import {
  getGrafanaAuth,
  getGrafanaDashboard,
  GrafanaApiError,
  searchGrafanaItems,
  type GrafanaSearchItem,
} from "@/lib/grafana-api";
import {
  isGrafanaTrulyConnected,
  mergeGrafanaMeta,
  parseGrafanaMeta,
  type GrafanaDashboardScope,
} from "@/lib/grafana-meta";
import type { Integration } from "@/generated/prisma/client";

export const MAX_GRAFANA_SCOPES = 15;

export type GrafanaScopeOption = {
  uid: string;
  title: string;
  type: "dashboard" | "folder";
  folderTitle?: string;
  tags?: string[];
  folderId?: number;
};

export async function getConnectedGrafanaIntegration(
  organizationId: string,
): Promise<Integration> {
  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "GRAFANA",
      },
    },
  });

  if (!integration || !isGrafanaTrulyConnected(integration)) {
    throw new Error("Grafana is not connected");
  }

  return integration;
}

function searchItemToOption(item: GrafanaSearchItem): GrafanaScopeOption {
  const isFolder = item.type === "dash-folder";
  return {
    uid: item.uid,
    title: item.title,
    type: isFolder ? "folder" : "dashboard",
    folderTitle: item.folderTitle,
    tags: item.tags,
    folderId: isFolder ? item.id : item.folderId,
  };
}

export function matchesGrafanaTagFilter(
  tags: string[] | undefined,
  tagFilter: string[] | undefined,
): boolean {
  if (!tagFilter?.length) return true;
  const itemTags = new Set((tags ?? []).map((t) => t.toLowerCase()));
  return tagFilter.some((t) => itemTags.has(t.toLowerCase()));
}

export async function fetchOrgGrafanaScopes(organizationId: string): Promise<{
  items: GrafanaScopeOption[];
  selectedScopes: GrafanaDashboardScope[];
  tagFilter: string[];
  alertLabelSelectors: Record<string, string>;
}> {
  const integration = await getConnectedGrafanaIntegration(organizationId);
  const meta = parseGrafanaMeta(integration.metadataJson);
  const grafanaUrl = meta.grafanaUrl;
  if (!grafanaUrl) throw new Error("Grafana URL is missing");

  const auth = getGrafanaAuth(integration);
  if (!auth) throw new Error("Grafana credentials are missing");

  const [dashboards, folders] = await Promise.all([
    searchGrafanaItems(grafanaUrl, auth, { type: "dash-db" }),
    searchGrafanaItems(grafanaUrl, auth, { type: "dash-folder" }),
  ]);

  const items = [...folders, ...dashboards]
    .map(searchItemToOption)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

  return {
    items,
    selectedScopes: meta.dashboardScopes ?? [],
    tagFilter: meta.tagFilter ?? [],
    alertLabelSelectors: meta.alertLabelSelectors ?? {},
  };
}

function normalizeScopes(scopes: GrafanaDashboardScope[]): GrafanaDashboardScope[] {
  const seen = new Set<string>();
  const normalized: GrafanaDashboardScope[] = [];

  for (const scope of scopes) {
    const uid = scope.uid?.trim();
    const title = scope.title?.trim();
    if (!uid || !title) continue;
    const key = `${scope.type}:${uid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      uid,
      title,
      type: scope.type === "folder" ? "folder" : "dashboard",
      folderTitle: scope.folderTitle,
      tags: scope.tags,
    });
    if (normalized.length >= MAX_GRAFANA_SCOPES) break;
  }

  return normalized;
}

async function validateScope(
  grafanaUrl: string,
  auth: NonNullable<ReturnType<typeof getGrafanaAuth>>,
  scope: GrafanaDashboardScope,
): Promise<void> {
  if (scope.type === "folder") {
    const folders = await searchGrafanaItems(grafanaUrl, auth, { type: "dash-folder" });
    const found = folders.find((f) => f.uid === scope.uid);
    if (!found) {
      throw new Error(`Folder "${scope.title}" is not accessible in Grafana`);
    }
    return;
  }

  try {
    await getGrafanaDashboard(grafanaUrl, auth, scope.uid);
  } catch (e) {
    if (e instanceof GrafanaApiError && (e.status === 404 || e.status === 403)) {
      throw new Error(`Dashboard "${scope.title}" is not accessible in Grafana`);
    }
    throw e;
  }
}

export async function saveOrgGrafanaScopes(input: {
  organizationId: string;
  userId: string;
  dashboardScopes: GrafanaDashboardScope[];
  tagFilter?: string[];
  alertLabelSelectors?: Record<string, string>;
}): Promise<{ dashboardScopes: GrafanaDashboardScope[] }> {
  const scopes = normalizeScopes(input.dashboardScopes);
  if (scopes.length === 0) {
    throw new Error("Select at least one dashboard or folder");
  }

  const integration = await getConnectedGrafanaIntegration(input.organizationId);
  const meta = parseGrafanaMeta(integration.metadataJson);
  const grafanaUrl = meta.grafanaUrl;
  if (!grafanaUrl) throw new Error("Grafana URL is missing");

  const auth = getGrafanaAuth(integration);
  if (!auth) throw new Error("Grafana credentials are missing");

  for (const scope of scopes) {
    await validateScope(grafanaUrl, auth, scope);
  }

  const tagFilter = (input.tagFilter ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);

  const alertLabelSelectors: Record<string, string> = {};
  if (input.alertLabelSelectors) {
    for (const [key, value] of Object.entries(input.alertLabelSelectors)) {
      const k = key.trim();
      const v = value.trim();
      if (k && v) alertLabelSelectors[k] = v;
    }
  }

  const metadataJson = mergeGrafanaMeta(meta, {
    dashboardScopes: scopes,
    tagFilter,
    alertLabelSelectors,
    lastError: undefined,
  });

  await prisma.$transaction(async (tx) => {
    await tx.integration.update({
      where: { id: integration.id },
      data: { metadataJson },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "integration.grafana.scopes_updated",
        entityType: "Integration",
        entityId: integration.id,
        metadataJson: JSON.stringify({
          scopeCount: scopes.length,
          tagFilter,
        }),
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: input.organizationId,
        type: "integration.updated",
        title: "Grafana dashboard scopes updated",
        description: scopes.map((s) => s.title).join(", "),
        metadataJson: JSON.stringify({ provider: "GRAFANA", scopeCount: scopes.length }),
      },
    });
  });

  return { dashboardScopes: scopes };
}

export async function expandGrafanaScopesToDashboardUids(input: {
  grafanaUrl: string;
  auth: NonNullable<ReturnType<typeof getGrafanaAuth>>;
  scopes: GrafanaDashboardScope[];
  tagFilter?: string[];
}): Promise<Array<{ uid: string; title: string; folderTitle?: string; tags?: string[] }>> {
  const dashboards: Array<{
    uid: string;
    title: string;
    folderTitle?: string;
    tags?: string[];
  }> = [];
  const seen = new Set<string>();
  const tagFilter = input.tagFilter;

  function addDashboard(dash: {
    uid: string;
    title: string;
    folderTitle?: string;
    tags?: string[];
  }) {
    if (!matchesGrafanaTagFilter(dash.tags, tagFilter)) return;
    if (seen.has(dash.uid)) return;
    seen.add(dash.uid);
    dashboards.push(dash);
  }

  for (const scope of input.scopes) {
    if (scope.type === "dashboard") {
      addDashboard({
        uid: scope.uid,
        title: scope.title,
        folderTitle: scope.folderTitle,
        tags: scope.tags,
      });
      continue;
    }

    const folders = await searchGrafanaItems(input.grafanaUrl, input.auth, {
      type: "dash-folder",
    });
    const folder = folders.find((f) => f.uid === scope.uid);
    if (!folder) continue;

    const folderDashboards = await searchGrafanaItems(input.grafanaUrl, input.auth, {
      type: "dash-db",
      folderIds: folder.id,
    });

    for (const dash of folderDashboards) {
      addDashboard({
        uid: dash.uid,
        title: dash.title,
        folderTitle: scope.title,
        tags: dash.tags,
      });
    }
  }

  return dashboards;
}

export function resolveSyncDashboardScopes(input: {
  metaScopes?: GrafanaDashboardScope[];
}): GrafanaDashboardScope[] {
  const scopes = normalizeScopes(input.metaScopes ?? []);
  if (scopes.length === 0) {
    throw new Error("Select at least one dashboard or folder before syncing.");
  }
  return scopes;
}
