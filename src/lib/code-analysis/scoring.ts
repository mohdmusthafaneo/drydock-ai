import type { Mastra } from "@mastra/core/mastra";
import { generateProductIntelligenceText, parseLlmJson } from "@/mastra/workflows/llm-text";
import type {
  AiAttribution,
  CodeAnalysisPullRequest,
} from "@/lib/code-analysis/types";
import type { JiraIssueText } from "@/lib/code-analysis/jira-issue-fetch";

export type CompletionScoreResult = {
  completionScore: number | null;
  completionRationale: string;
};

export type RiskLevel = "low" | "medium" | "high";

export type CompositeRiskResult = {
  riskScore: number;
  riskLevel: RiskLevel;
  qualityFlags: string[];
};

function isAiAttribution(a: AiAttribution): boolean {
  return a === "ai_assisted" || a === "ai_generated";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/** Deterministic completion fallback when LLM or Jira is unavailable. */
export function fallbackCompletionScore(input: {
  jiraKeys: string[];
  hasDiff: boolean;
}): CompletionScoreResult {
  if (input.jiraKeys.length === 0) {
    return {
      completionScore: null,
      completionRationale: "No Jira ticket linked — cannot assess ticket completion.",
    };
  }
  if (!input.hasDiff) {
    return {
      completionScore: null,
      completionRationale: "No diff captured — re-run code analysis sync to score completion.",
    };
  }
  return {
    completionScore: null,
    completionRationale: "LLM scoring unavailable — completion not assessed.",
  };
}

const COMPLETION_PROMPT = `You are a delivery governance analyst. Compare the Jira ticket requirements to the code diff and score how completely the change fulfills the ticket.

Respond with JSON only:
{
  "completionScore": <integer 0-100>,
  "rationale": "<one or two sentences>"
}

Scoring guide:
- 90-100: Fully implements ticket scope with appropriate tests/docs if required
- 60-89: Core scope met with minor gaps
- 30-59: Partial implementation or significant scope drift
- 0-29: Does not address ticket or introduces unrelated changes

Ticket:
Summary: {{summary}}
Description:
{{description}}

Code diff excerpt:
{{diff}}
`;

export async function scoreCompletionWithLlm(
  mastra: Mastra,
  issue: JiraIssueText,
  diffExcerpt: string,
): Promise<CompletionScoreResult> {
  const prompt = COMPLETION_PROMPT.replace("{{summary}}", issue.summary)
    .replace("{{description}}", issue.description || "(no description)")
    .replace("{{diff}}", diffExcerpt.slice(0, 5000));

  try {
    const raw = await generateProductIntelligenceText(mastra, prompt);
    const parsed = parseLlmJson<{ completionScore?: number; rationale?: string }>(raw);
    if (!parsed || typeof parsed.completionScore !== "number") {
      return {
        completionScore: null,
        completionRationale: "LLM returned an invalid completion score.",
      };
    }
    return {
      completionScore: clampScore(parsed.completionScore),
      completionRationale: parsed.rationale?.trim() || "Completion scored by LLM.",
    };
  } catch {
    return {
      completionScore: null,
      completionRationale: "LLM scoring failed.",
    };
  }
}

function isTestFile(path: string): boolean {
  return (
    /\.(test|spec)\.[jt]sx?$/i.test(path) ||
    /__tests__\//i.test(path) ||
    /\/tests?\//i.test(path)
  );
}

function countTestFilesInDiff(diffExcerpt: string): number {
  const matches = diffExcerpt.match(/^---\s+(.+?)\s+\(/gm);
  if (!matches) return 0;
  return matches.filter((line) => {
    const path = line.replace(/^---\s+/, "").split(" (")[0] ?? "";
    return isTestFile(path);
  }).length;
}

/** Deterministic quality signals + composite introduction risk score. */
export function computeCompositeRisk(pr: CodeAnalysisPullRequest): CompositeRiskResult {
  const flags: string[] = [];
  let score = 0;

  if (!isAiAttribution(pr.attribution)) {
    return { riskScore: 0, riskLevel: "low", qualityFlags: [] };
  }

  const totalLines = pr.linesAdded + pr.linesRemoved;
  const churnRatio = totalLines > 0 ? pr.linesAdded / totalLines : 0;
  if (churnRatio > 0.92 && pr.linesAdded > 200) {
    flags.push("high_churn");
    score += 18;
  }

  if (pr.reviewCount === 0) {
    flags.push("no_review");
    score += 25;
  } else if (pr.reviewCount === 1) {
    flags.push("shallow_review");
    score += 10;
  }

  if (pr.linesAdded > 500) {
    flags.push("large_ai_change");
    score += 20;
  } else if (pr.linesAdded > 300) {
    flags.push("bulk_addition");
    score += 12;
  }

  const diff = pr.diffExcerpt ?? "";
  const fileCount = (diff.match(/^---\s+/gm) ?? []).length;
  const testFiles = countTestFilesInDiff(diff);
  if (fileCount > 0 && testFiles === 0 && pr.linesAdded > 80) {
    flags.push("no_test_delta");
    score += 15;
  }

  if (pr.attribution === "ai_generated") {
    score += 12;
  }

  if (pr.confidence >= 85) {
    score += 8;
  }

  if (pr.jiraKeys.length === 0) {
    flags.push("unlinked_ticket");
    score += 10;
  }

  if (
    pr.completionScore != null &&
    pr.completionScore < 50 &&
    pr.jiraKeys.length > 0
  ) {
    flags.push("low_completion");
    score += 15;
  }

  const riskScore = clampScore(score);
  return {
    riskScore,
    riskLevel: riskLevelFromScore(riskScore),
    qualityFlags: flags,
  };
}

export function mergeCompletionResults(
  results: CompletionScoreResult[],
): CompletionScoreResult {
  const scored = results.filter((r) => r.completionScore != null);
  if (scored.length === 0) {
    return (
      results[0] ?? {
        completionScore: null,
        completionRationale: "No completion data.",
      }
    );
  }
  const avg =
    scored.reduce((sum, r) => sum + (r.completionScore ?? 0), 0) / scored.length;
  const rationale = scored.map((r) => r.completionRationale).join(" ");
  return {
    completionScore: clampScore(avg),
    completionRationale: rationale.slice(0, 500),
  };
}
