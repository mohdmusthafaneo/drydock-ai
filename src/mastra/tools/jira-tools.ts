import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  queryJiraJqlForOrganization,
  JIRA_JQL_PRESETS,
} from "@/lib/agent-control-plane/tools/jira-tools";
import {
  applyJiraMetaPatch,
  resolveJiraAccessToken,
} from "@/lib/jira-api";
import { getConnectedJiraIntegration } from "@/lib/jira-project-selection";
import { fetchJiraMyself } from "@/lib/jira-oauth";
import { prisma } from "@/lib/prisma";

/**
 * Mastra wrappers over AIDOS Jira Integration OAuth (not warehouse JiraConfig).
 * Tokens stay server-side — never return access tokens to the model.
 */

export const jiraMyselfTool = createTool({
  id: "jira-myself",
  description:
    "Fetch the authenticated Jira user via GET /rest/api/3/myself for an AIDOS organization. Authenticates from the org's connected Jira Integration (OAuth resolved server-side).",
  inputSchema: z.object({
    organizationId: z
      .string()
      .min(1)
      .describe("AIDOS organization id with a connected Jira integration"),
  }),
  outputSchema: z.object({
    accountId: z.string().optional(),
    displayName: z.string().optional(),
    emailAddress: z.string().optional(),
    cloudId: z.string(),
    raw: z.record(z.string(), z.unknown()),
  }),
  execute: async (inputData) => {
    const integration = await getConnectedJiraIntegration(
      inputData.organizationId,
    );
    const { accessToken, cloudId, metaPatch } =
      await resolveJiraAccessToken(integration);
    if (metaPatch) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { metadataJson: applyJiraMetaPatch(integration, metaPatch) },
      });
    }

    const myself = await fetchJiraMyself(accessToken, cloudId);
    return {
      accountId: myself.accountId,
      displayName: myself.displayName,
      emailAddress: myself.emailAddress,
      cloudId,
      raw: { ...myself },
    };
  },
});

export const jiraJqlTool = createTool({
  id: "jira-jql",
  description:
    "Run a JQL search (or preset) against the organization's connected Jira site. Queries are scoped to selected sync projects. Prefer presets when possible.",
  inputSchema: z.object({
    organizationId: z
      .string()
      .min(1)
      .describe("AIDOS organization id with a connected Jira integration"),
    jql: z.string().optional().describe("Raw JQL (scoped to org projects if no project clause)"),
    preset: z
      .enum(JIRA_JQL_PRESETS)
      .optional()
      .describe("Preset: open_bugs | blocked | open | done"),
    mode: z.enum(["count", "issues"]).optional(),
    maxResults: z.number().int().positive().max(50).optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    jql: z.string().optional(),
    mode: z.enum(["count", "issues"]).optional(),
    projectKeys: z.array(z.string()).optional(),
    count: z.number().optional(),
    issues: z
      .array(
        z.object({
          key: z.string(),
          summary: z.string(),
          status: z.string(),
          issueType: z.string(),
          priority: z.string().optional(),
          assignee: z.string().optional(),
        }),
      )
      .optional(),
    nextPageToken: z.string().optional(),
    queriedAt: z.string().optional(),
    preset: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    if (!inputData.jql?.trim() && !inputData.preset) {
      return {
        ok: false,
        error: "Provide jql or a preset (open_bugs, blocked, open, done)",
      };
    }

    const result = await queryJiraJqlForOrganization({
      organizationId: inputData.organizationId,
      jql: inputData.jql,
      preset: inputData.preset,
      mode: inputData.mode ?? "issues",
      maxResults: inputData.maxResults,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return {
      ok: true,
      jql: result.jql,
      mode: result.mode,
      projectKeys: result.projectKeys,
      count: result.count,
      issues: result.issues,
      nextPageToken: result.nextPageToken,
      queriedAt: result.queriedAt,
      preset: result.preset,
    };
  },
});
