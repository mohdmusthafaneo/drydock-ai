import { prisma } from "@/lib/prisma";
import { resolveJiraAccessToken, searchIssuesWithDescriptions } from "@/lib/jira-api";
import { parseJiraMeta } from "@/lib/jira-meta";

export type JiraIssueText = {
  key: string;
  summary: string;
  description: string;
  assignee?: string;
};

/** Fetch issue summary + description for linked Jira keys (read-only). */
export async function fetchJiraIssueTexts(
  organizationId: string,
  keys: string[],
): Promise<Map<string, JiraIssueText>> {
  const uniqueKeys = [...new Set(keys)].slice(0, 20);
  const result = new Map<string, JiraIssueText>();
  if (uniqueKeys.length === 0) return result;

  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "JIRA",
      },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    return result;
  }

  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.cloudId) return result;

  try {
    const { accessToken, cloudId } = await resolveJiraAccessToken(integration);
    const issues = await searchIssuesWithDescriptions(accessToken, cloudId, uniqueKeys);
    for (const issue of issues) {
      result.set(issue.key, {
        key: issue.key,
        summary: issue.summary,
        description: issue.description,
        assignee: issue.assignee,
      });
    }
  } catch {
    return result;
  }

  return result;
}
