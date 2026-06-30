import type { AiAttribution, CodeAnalysisPullRequest } from "@/lib/code-analysis/types";

export function isAiAttribution(a: AiAttribution): boolean {
  return a === "ai_assisted" || a === "ai_generated";
}

export function hasNamedReviewer(pr: CodeAnalysisPullRequest): boolean {
  return (pr.reviewers?.length ?? 0) > 0 || pr.reviewCount > 0;
}

export function primaryJiraProjectKey(jiraKeys: string[]): string | null {
  const key = jiraKeys.find((k) => /^[A-Z][A-Z0-9]+-\d+$/i.test(k));
  if (!key) return null;
  return key.split("-")[0]?.toUpperCase() ?? null;
}

export function buildDedupKey(
  ruleKey: string,
  targetType: string,
  targetExternalId: string,
): string {
  return `${ruleKey}:${targetType}:${targetExternalId}`;
}
