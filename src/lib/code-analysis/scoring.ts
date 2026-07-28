import type {
  AiAttribution,
  CodeAnalysisPullRequest,
} from "@/lib/code-analysis/types";

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
  diffExcerpt?: string;
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

  let score = 50;
  const rationaleParts = [
    "Deterministic estimate — LLM scoring unavailable; linked ticket and diff present.",
  ];
  const diffUpper = (input.diffExcerpt ?? "").toUpperCase();
  const keysInDiff = input.jiraKeys.filter((key) => diffUpper.includes(key.toUpperCase()));
  if (keysInDiff.length > 0) {
    score += 15;
    rationaleParts.push(
      `Ticket key${keysInDiff.length === 1 ? "" : "s"} ${keysInDiff.join(", ")} referenced in diff.`,
    );
  }
  if (/\.(test|spec)\.[jt]sx?/i.test(diffUpper) || /__tests__\//i.test(diffUpper)) {
    score += 10;
    rationaleParts.push("Test file changes detected in diff.");
  }

  return {
    completionScore: clampScore(score),
    completionRationale: rationaleParts.join(" "),
  };
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
