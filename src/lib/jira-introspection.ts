import { prisma } from "@/lib/prisma";
import {
  countIssuesByJql,
  JiraApiError,
  listJiraFields,
  listJiraIssueTypes,
  listProjectStatuses,
  resolveJiraAccessToken,
} from "@/lib/jira-api";
import {
  mergeJiraMeta,
  parseJiraMeta,
  type JiraDeliverySnapshot,
  type JiraSchemaSnapshot,
} from "@/lib/jira-meta";

import { resolveSyncProjectKeys } from "@/lib/jira-project-selection";

const SCHEMA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FIELDS_RETURNED = 200;
const INTROSPECT_THROTTLE_MS = 5 * 60 * 1000;

const lastIntrospectAt = new Map<string, number>();

const BLOCKED_PATTERN = /block|hold|wait|impediment/i;
const BUG_PATTERN = /bug|defect|incident/i;
const STORY_POINT_PATTERN = /story point|story points|points|estimate/i;

function mappableFields(
  fields: JiraSchemaSnapshot["fields"],
): JiraSchemaSnapshot["fields"] {
  const relevant = fields.filter(
    (f) =>
      f.custom ||
      f.id === "status" ||
      STORY_POINT_PATTERN.test(f.name) ||
      f.schema?.custom?.includes("float"),
  );
  return relevant.slice(0, MAX_FIELDS_RETURNED);
}

export function isJiraSchemaStale(
  snapshot: JiraSchemaSnapshot | undefined,
  projectKeys: string[],
): boolean {
  if (!snapshot) return true;
  if (snapshot.projectKeys.sort().join() !== [...projectKeys].sort().join()) return true;
  const age = Date.now() - new Date(snapshot.syncedAt).getTime();
  return age > SCHEMA_TTL_MS;
}

export function rankMappingSuggestions(input: {
  schema: Pick<JiraSchemaSnapshot, "statuses" | "issueTypes" | "fields">;
  deliverySnapshot?: JiraDeliverySnapshot;
}): JiraSchemaSnapshot["suggestions"] {
  const suggestions: JiraSchemaSnapshot["suggestions"] = {};

  const statusMatches = input.schema.statuses.filter((s) => BLOCKED_PATTERN.test(s.name));
  if (statusMatches.length === 1) {
    const s = statusMatches[0]!;
    suggestions.blockedStatus = {
      name: s.name,
      id: s.id,
      reason: `Status name matches blocked/hold pattern`,
      confidence: 0.9,
    };
  } else if (statusMatches.length > 1) {
    const preferred = statusMatches.find((s) => /hold|block/i.test(s.name)) ?? statusMatches[0]!;
    suggestions.blockedStatus = {
      name: preferred.name,
      id: preferred.id,
      reason: `${statusMatches.length} statuses match blocked pattern; suggested "${preferred.name}"`,
      confidence: 0.75,
    };
  } else {
    suggestions.blockedStatus = {
      name: "Blocked",
      id: "",
      reason: "No blocked-pattern status found — using default",
      confidence: 0.3,
    };
  }

  const bugTypes = input.schema.issueTypes.filter(
    (t) => !t.subtask && BUG_PATTERN.test(t.name),
  );
  if (bugTypes.length === 1) {
    const t = bugTypes[0]!;
    suggestions.bugIssueType = {
      name: t.name,
      id: t.id,
      reason: `Issue type matches bug/defect pattern`,
      confidence: 0.9,
    };
  } else if (bugTypes.length > 1) {
    const preferred = bugTypes.find((t) => /bug/i.test(t.name)) ?? bugTypes[0]!;
    suggestions.bugIssueType = {
      name: preferred.name,
      id: preferred.id,
      reason: `${bugTypes.length} bug-like types found; suggested "${preferred.name}"`,
      confidence: 0.7,
    };
  } else {
    suggestions.bugIssueType = {
      name: "Bug",
      id: "",
      reason: "No bug issue type detected — pick manually",
      confidence: 0.2,
    };
  }

  const storyFields = input.schema.fields.filter(
    (f) =>
      f.custom &&
      (STORY_POINT_PATTERN.test(f.name) ||
        f.schema?.custom === "com.atlassian.jira.plugin.system.customfieldtypes:float"),
  );
  if (storyFields.length > 0) {
    const f = storyFields[0]!;
    suggestions.storyPointField = {
      id: f.id,
      name: f.name,
      reason: `Custom field name matches story point pattern`,
      confidence: 0.65,
    };
  }

  const primaryProject = input.deliverySnapshot?.projects[0];
  const hasFixVersions = (primaryProject?.versions.length ?? 0) > 0;
  const hasActiveSprint = Boolean(primaryProject?.activeSprint);
  const isScrum = primaryProject?.board?.type === "scrum";

  if (hasFixVersions) {
    suggestions.releaseTracking = {
      mode: "fixVersion",
      reason: "Fix versions found in delivery snapshot",
    };
  } else if (hasActiveSprint && isScrum) {
    suggestions.releaseTracking = {
      mode: "sprint",
      reason: "Active sprint on scrum board",
    };
  } else {
    suggestions.releaseTracking = {
      mode: "fixVersion",
      reason: "Default — confirm how your team tracks releases",
    };
  }

  return suggestions;
}

export function suggestionConfidence(
  suggestions: JiraSchemaSnapshot["suggestions"],
): "high" | "medium" | "low" {
  const blocked = suggestions.blockedStatus?.confidence ?? 0;
  const bug = suggestions.bugIssueType?.confidence ?? 0;
  const min = Math.min(blocked, bug);
  if (min >= 0.8) return "high";
  if (min >= 0.5) return "medium";
  return "low";
}

export async function fetchProjectStatuses(
  accessToken: string,
  cloudId: string,
  projectKeys: string[],
): Promise<JiraSchemaSnapshot["statuses"]> {
  const statuses: JiraSchemaSnapshot["statuses"] = [];
  const seen = new Set<string>();

  for (const projectKey of projectKeys) {
    try {
      const issueTypeStatuses = await listProjectStatuses(accessToken, cloudId, projectKey);
      for (const group of issueTypeStatuses) {
        for (const status of group.statuses) {
          const key = `${projectKey}:${status.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          statuses.push({
            id: status.id,
            name: status.name,
            statusCategory: status.statusCategory,
            scope: { projectKey },
          });
        }
      }
    } catch (e) {
      if (e instanceof JiraApiError && [403, 404].includes(e.status)) continue;
      throw e;
    }
  }

  return statuses;
}

export async function fetchIssueTypes(
  accessToken: string,
  cloudId: string,
  projectKeys: string[],
): Promise<JiraSchemaSnapshot["issueTypes"]> {
  const allTypes = await listJiraIssueTypes(accessToken, cloudId);
  const keySet = new Set(projectKeys.map((k) => k.toUpperCase()));
  const scoped = allTypes.filter((t) => {
    const projectKey = t.scope?.project?.key?.toUpperCase();
    return !projectKey || keySet.has(projectKey);
  });

  const deduped = new Map<string, JiraSchemaSnapshot["issueTypes"][number]>();
  for (const t of scoped.length > 0 ? scoped : allTypes) {
    deduped.set(t.id, {
      id: t.id,
      name: t.name,
      subtask: t.subtask,
      scope: t.scope?.project?.key,
    });
  }
  return [...deduped.values()];
}

export async function fetchRelevantFields(
  accessToken: string,
  cloudId: string,
): Promise<JiraSchemaSnapshot["fields"]> {
  const fields = await listJiraFields(accessToken, cloudId);
  return mappableFields(
    fields.map((f) => ({
      id: f.id,
      name: f.name,
      custom: f.custom,
      schema: f.schema,
    })),
  );
}

async function detectLabelHeavyWorkflow(
  accessToken: string,
  cloudId: string,
  projectKey: string,
): Promise<boolean> {
  try {
    const count = await countIssuesByJql(
      accessToken,
      cloudId,
      `project = "${projectKey}" AND labels is not EMPTY`,
    );
    return count > 10;
  } catch {
    return false;
  }
}

export async function introspectJiraSchema(input: {
  organizationId: string;
  projectKeys?: string[];
  force?: boolean;
}): Promise<JiraSchemaSnapshot> {
  const now = Date.now();
  const last = lastIntrospectAt.get(input.organizationId) ?? 0;
  if (!input.force && now - last < INTROSPECT_THROTTLE_MS) {
    throw new Error("Schema introspection was run recently — wait a few minutes before refreshing");
  }

  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: input.organizationId,
        provider: "JIRA",
      },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    throw new Error("Jira is not connected");
  }

  const meta = parseJiraMeta(integration.metadataJson);
  const { accessToken, cloudId, metaPatch } = await resolveJiraAccessToken(integration);

  const projectKeys = resolveSyncProjectKeys({
    metaKeys: meta.projectKeys,
    bodyKeys: input.projectKeys,
  });

  const [statuses, issueTypes, fields] = await Promise.all([
    fetchProjectStatuses(accessToken, cloudId, projectKeys),
    fetchIssueTypes(accessToken, cloudId, projectKeys),
    fetchRelevantFields(accessToken, cloudId),
  ]);

  const partialSchema = { statuses, issueTypes, fields };
  let suggestions = rankMappingSuggestions({
    schema: partialSchema,
    deliverySnapshot: meta.deliverySnapshot,
  });

  if (projectKeys[0]) {
    const labelHeavy = await detectLabelHeavyWorkflow(accessToken, cloudId, projectKeys[0]);
    if (labelHeavy && !meta.deliverySnapshot?.projects[0]?.versions.length) {
      suggestions = {
        ...suggestions,
        releaseTracking: {
          mode: "labels",
          reason: "High label usage detected in project",
        },
      };
    }
  }

  const syncedAt = new Date().toISOString();
  const snapshot: JiraSchemaSnapshot = {
    syncedAt,
    projectKeys,
    issueTypes,
    statuses,
    fields,
    suggestions,
  };

  const metadataJson = mergeJiraMeta(meta, {
    ...metaPatch,
    jiraSchemaSnapshot: snapshot,
  });

  await prisma.integration.update({
    where: { id: integration.id },
    data: { metadataJson },
  });

  lastIntrospectAt.set(input.organizationId, now);

  return snapshot;
}

/** Best-effort introspection after sync — does not throw on failure. */
export async function maybeIntrospectJiraAfterSync(organizationId: string): Promise<void> {
  try {
    const integration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: "JIRA" },
      },
    });
    if (!integration) return;

    const meta = parseJiraMeta(integration.metadataJson);
    const projectKeys = meta.projectKeys ?? [];
    if (projectKeys.length === 0) return;

    if (!isJiraSchemaStale(meta.jiraSchemaSnapshot, projectKeys)) return;

    await introspectJiraSchema({ organizationId, force: false });
  } catch {
    // best-effort
  }
}

export function clientSafeJiraSchema(snapshot: JiraSchemaSnapshot): JiraSchemaSnapshot {
  return {
    ...snapshot,
    fields: mappableFields(snapshot.fields),
  };
}
