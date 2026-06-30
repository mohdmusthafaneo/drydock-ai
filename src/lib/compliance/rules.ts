import type {
  CodeAnalysisCommit,
  CodeAnalysisPullRequest,
} from "@/lib/code-analysis/types";
import {
  buildDedupKey,
  hasNamedReviewer,
  isAiAttribution,
  primaryJiraProjectKey,
} from "@/lib/compliance/helpers";
import type {
  ComplianceEvalPhase,
  ComplianceFindingCandidate,
  ComplianceFindingSeverity,
} from "@/lib/compliance/types";

export type ComplianceRuleDefinition = {
  key: string;
  title: string;
  phase: Exclude<ComplianceEvalPhase, "all">;
  defaultSeverity: ComplianceFindingSeverity;
  evaluate: (ctx: ComplianceRuleContext) => ComplianceFindingCandidate[];
};

export type ComplianceRuleContext = {
  pullRequests: CodeAnalysisPullRequest[];
  commits: CodeAnalysisCommit[];
};

function prCandidate(
  ruleKey: string,
  severity: ComplianceFindingSeverity,
  pr: CodeAnalysisPullRequest,
  title: string,
  detail: Record<string, unknown>,
): ComplianceFindingCandidate {
  return {
    ruleKey,
    dedupKey: buildDedupKey(ruleKey, "pull_request", pr.id),
    severity,
    targetType: "pull_request",
    targetExternalId: pr.id,
    projectKey: primaryJiraProjectKey(pr.jiraKeys ?? []),
    title,
    detail,
    entityLabel: `#${pr.number} · ${pr.title}`,
    entityUrl: pr.url,
    repo: pr.repo,
  };
}

function commitCandidate(
  ruleKey: string,
  severity: ComplianceFindingSeverity,
  commit: CodeAnalysisCommit,
  title: string,
  detail: Record<string, unknown>,
): ComplianceFindingCandidate {
  return {
    ruleKey,
    dedupKey: buildDedupKey(ruleKey, "commit", commit.sha),
    severity,
    targetType: "commit",
    targetExternalId: commit.sha,
    projectKey: primaryJiraProjectKey(commit.jiraKeys ?? []),
    title,
    detail,
    entityLabel: commit.message.split("\n")[0].slice(0, 80),
    entityUrl: commit.url,
    repo: commit.repo,
  };
}

export const COMPLIANCE_RULE_CATALOG: ComplianceRuleDefinition[] = [
  {
    key: "ai_pr_no_review",
    title: "AI PR merged without review",
    phase: "sync",
    defaultSeverity: "critical",
    evaluate: ({ pullRequests }) => {
      const findings: ComplianceFindingCandidate[] = [];
      for (const pr of pullRequests) {
        if (!isAiAttribution(pr.attribution) || hasNamedReviewer(pr)) continue;
        const reviewerGap =
          (pr.reviewers?.length ?? 0) === 0
            ? "no named approver"
            : "insufficient review coverage";
        findings.push(
          prCandidate(
            "ai_pr_no_review",
            pr.attribution === "ai_generated" ? "critical" : "warning",
            pr,
            "High-AI PR merged without review",
            {
              attribution: pr.attribution,
              confidence: pr.confidence,
              reviewerGap,
              reviewCount: pr.reviewCount,
            },
          ),
        );
      }
      return findings;
    },
  },
  {
    key: "unlinked_ai_pr",
    title: "AI change with no linked ticket",
    phase: "sync",
    defaultSeverity: "warning",
    evaluate: ({ pullRequests }) => {
      const findings: ComplianceFindingCandidate[] = [];
      for (const pr of pullRequests) {
        if (!isAiAttribution(pr.attribution) || (pr.jiraKeys?.length ?? 0) > 0) continue;
        findings.push(
          prCandidate("unlinked_ai_pr", "warning", pr, "AI change with no linked ticket", {
            attribution: pr.attribution,
            confidence: pr.confidence,
          }),
        );
      }
      return findings;
    },
  },
  {
    key: "large_ai_commit",
    title: "Large fully-AI commit",
    phase: "sync",
    defaultSeverity: "warning",
    evaluate: ({ commits }) => {
      const findings: ComplianceFindingCandidate[] = [];
      for (const commit of commits) {
        if (commit.attribution !== "ai_generated" || commit.additions <= 500) continue;
        findings.push(
          commitCandidate("large_ai_commit", "warning", commit, "Large fully-AI commit", {
            additions: commit.additions,
            confidence: commit.confidence,
            shaShort: commit.sha.slice(0, 7),
          }),
        );
      }
      return findings;
    },
  },
  {
    key: "high_risk_ai_pr",
    title: "High-risk AI code area",
    phase: "enrich",
    defaultSeverity: "critical",
    evaluate: ({ pullRequests }) => {
      const findings: ComplianceFindingCandidate[] = [];
      for (const pr of pullRequests) {
        if (pr.riskLevel !== "high" || !isAiAttribution(pr.attribution)) continue;
        const flags = pr.qualityFlags?.length
          ? pr.qualityFlags.join(", ")
          : "composite risk score";
        findings.push(
          prCandidate("high_risk_ai_pr", "critical", pr, "High-risk AI code area", {
            riskScore: pr.riskScore,
            riskLevel: pr.riskLevel,
            qualityFlags: pr.qualityFlags ?? [],
            flagsSummary: flags,
          }),
        );
      }
      return findings;
    },
  },
  {
    key: "no_test_delta",
    title: "AI change without test delta",
    phase: "enrich",
    defaultSeverity: "warning",
    evaluate: ({ pullRequests }) => {
      const findings: ComplianceFindingCandidate[] = [];
      for (const pr of pullRequests) {
        if (!isAiAttribution(pr.attribution)) continue;
        const hasFlag = pr.qualityFlags?.includes("no_test_delta");
        if (!hasFlag) continue;
        findings.push(
          prCandidate("no_test_delta", "warning", pr, "AI change without test delta", {
            linesAdded: pr.linesAdded,
            qualityFlags: pr.qualityFlags ?? [],
          }),
        );
      }
      return findings;
    },
  },
  {
    key: "low_completion",
    title: "Low ticket completion score",
    phase: "enrich",
    defaultSeverity: "warning",
    evaluate: ({ pullRequests }) => {
      const findings: ComplianceFindingCandidate[] = [];
      for (const pr of pullRequests) {
        if (
          !isAiAttribution(pr.attribution) ||
          pr.completionScore == null ||
          pr.completionScore >= 50 ||
          (pr.jiraKeys?.length ?? 0) === 0
        ) {
          continue;
        }
        findings.push(
          prCandidate("low_completion", "warning", pr, "Low ticket completion score", {
            completionScore: pr.completionScore,
            completionRationale: pr.completionRationale,
            jiraKeys: pr.jiraKeys ?? [],
          }),
        );
      }
      return findings;
    },
  },
];

export function rulesForPhase(phase: ComplianceEvalPhase): ComplianceRuleDefinition[] {
  if (phase === "all") return COMPLIANCE_RULE_CATALOG;
  return COMPLIANCE_RULE_CATALOG.filter((rule) => rule.phase === phase);
}
