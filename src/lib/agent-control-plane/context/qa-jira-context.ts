import { prisma } from "@/lib/prisma";
import {
  isJiraOAuthConnected,
  parseJiraMeta,
  type JiraDeliverySnapshot,
} from "@/lib/jira-meta";
import {
  LEGACY_JIRA_MAPPING,
  type JiraMappingSlice,
} from "@/lib/jira-jql";
import {
  parseToolchainMapping,
  type ToolchainMapping,
} from "@/lib/toolchain-mapping";

export type QaJiraContextInput = {
  connected: boolean;
  siteName?: string;
  siteUrl?: string;
  cloudId?: string;
  projectKeys: string[];
  snapshot?: JiraDeliverySnapshot;
  mapping: JiraMappingSlice;
  releaseTracking: string;
};

function resolveJiraMapping(toolchainMapping: ToolchainMapping): JiraMappingSlice {
  const jira = toolchainMapping.jira;
  if (!jira) return LEGACY_JIRA_MAPPING;
  return {
    blockedStatusName: jira.blockedStatusName,
    bugIssueType: jira.bugIssueType,
    doneStatusCategory: jira.doneStatusCategory,
    doneStatusNames: jira.doneStatusNames,
  };
}

function formatProjectSection(
  project: JiraDeliverySnapshot["projects"][number],
): string[] {
  const lines = [`### ${project.key} — ${project.name}`];

  if (project.board) {
    lines.push(
      `- Board: ${project.board.name} (${project.board.type}, id ${project.board.id})`,
    );
  } else {
    lines.push("- Board: none synced");
  }

  if (project.activeSprint) {
    const sprint = project.activeSprint;
    const progress =
      sprint.committed != null && sprint.done != null
        ? ` · committed ${sprint.committed} · done ${sprint.done}`
        : "";
    lines.push(
      `- Active sprint: ${sprint.name} (${sprint.state}, id ${sprint.id})${progress}`,
    );
    lines.push(`- Sprint JQL hint: sprint = ${sprint.id}`);
    if (sprint.openIssues != null) {
      lines.push(
        `- Sprint scope counts: open ${sprint.openIssues} · blocked ${sprint.blockedCount ?? 0} · bugs ${sprint.bugsOpen ?? 0} · overdue ${sprint.overdueCount ?? 0}`,
      );
    }
  } else {
    lines.push("- Active sprint: none");
  }

  lines.push(
    `- Snapshot counts: open ${project.openIssues} · bugs ${project.bugsOpen} · blocked ${project.blockedCount} · unassigned ${project.unassignedCount}`,
  );

  if (project.statusBreakdown) {
    const breakdown = project.statusBreakdown;
    lines.push(
      `- Status flow: todo ${breakdown.todo} · in progress ${breakdown.inProgress} · done ${breakdown.done}`,
    );
  }

  const versions = project.versions.slice(0, 6);
  if (versions.length > 0) {
    const versionLines = versions.map((version) => {
      const flags = [
        version.released ? "released" : "unreleased",
        version.overdue ? "overdue" : null,
        version.openIssuesInVersion != null
          ? `open ${version.openIssuesInVersion}`
          : null,
      ].filter(Boolean);
      return `${version.name} (${flags.join(", ")})`;
    });
    lines.push(`- Fix versions: ${versionLines.join(" · ")}`);
  }

  return lines;
}

function formatMappingSection(mapping: JiraMappingSlice, tracking: string): string[] {
  const scopeNote =
    tracking === "sprint"
      ? "All delivery metrics and QA assess use active sprint scope (sprint = {id}), not full project backlog."
      : tracking === "fixVersion"
        ? "Release metrics use fix version scope (fixVersion = \"name\")."
        : "";
  return [
    "### Toolchain mapping (for JQL presets)",
    `- Blocked status: ${mapping.blockedStatusName}`,
    `- Bug issue type: ${mapping.bugIssueType}`,
    `- Done status category: ${mapping.doneStatusCategory}`,
    `- Release tracking: ${tracking}`,
    ...(scopeNote ? [`- Scope: ${scopeNote}`] : []),
    "",
    "### JQL query tool (`aidos_query_jira_jql`)",
    "- Presets: `open_bugs`, `blocked`, `open`, `done` (use mapping above)",
    "- Custom JQL is auto-scoped to sync projects — omit `project = ...` unless targeting one project",
    "- Use `mode=count` for totals; `mode=issues` for sample rows",
    "- Snapshot counts above may be stale — prefer live tool results for answers",
  ];
}

export function formatQaJiraContextMarkdown(input: QaJiraContextInput): string {
  const lines = ["## Org Jira context (runtime)", ""];

  if (!input.connected) {
    lines.push(
      "- **Connection:** not connected",
      "- Connect Jira in Integrations and select sync projects before using `aidos_query_jira_jql`.",
    );
    return lines.join("\n");
  }

  lines.push(
    `- **Connection:** connected`,
    `- **Site:** ${input.siteName ?? "Jira Cloud"} (${input.siteUrl ?? input.cloudId ?? "unknown site"})`,
    `- **Sync projects:** ${input.projectKeys.length > 0 ? input.projectKeys.join(", ") : "none selected"}`,
    `- **Last snapshot sync:** ${input.snapshot?.syncedAt ?? "never — run Jira sync in Integrations"}`,
  );

  if (input.projectKeys.length === 0) {
    lines.push(
      "",
      "Jira queries will fail until at least one sync project is selected in Integrations.",
    );
    return lines.join("\n");
  }

  if (input.snapshot?.projects?.length) {
    lines.push("");
    lines.push("### Synced boards & delivery snapshot");
    for (const project of input.snapshot.projects) {
      lines.push(...formatProjectSection(project));
      lines.push("");
    }
  } else {
    lines.push(
      "",
      "No delivery snapshot yet — live JQL queries can still run against selected projects.",
      "",
    );
  }

  lines.push(...formatMappingSection(input.mapping, input.releaseTracking));

  return lines.join("\n").trim();
}

/** Runtime org Jira context injected into QA Intelligence system prompt. */
export async function buildQaJiraContextMarkdown(
  organizationId: string,
): Promise<string> {
  const [integration, profile] = await Promise.all([
    prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: "JIRA",
        },
      },
    }),
    prisma.organizationProfile.findUnique({
      where: { organizationId },
    }),
  ]);

  const toolchainMapping = parseToolchainMapping(profile?.toolchainMappingJson);

  if (!integration || !isJiraOAuthConnected(integration)) {
    return formatQaJiraContextMarkdown({
      connected: false,
      projectKeys: [],
      mapping: resolveJiraMapping(toolchainMapping),
      releaseTracking: toolchainMapping.jira?.releaseTracking ?? "fixVersion",
    });
  }

  const meta = parseJiraMeta(integration.metadataJson);

  return formatQaJiraContextMarkdown({
    connected: true,
    siteName: meta.siteName,
    siteUrl: meta.siteUrl,
    cloudId: meta.cloudId,
    projectKeys: meta.projectKeys ?? [],
    snapshot: meta.deliverySnapshot,
    mapping: resolveJiraMapping(toolchainMapping),
    releaseTracking: toolchainMapping.jira?.releaseTracking ?? "fixVersion",
  });
}
