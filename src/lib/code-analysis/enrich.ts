import { prisma } from "@/lib/prisma";
import { fetchJiraIssueTexts } from "@/lib/code-analysis/jira-issue-fetch";
import { readJsonField } from "@/lib/json-field";
import {
  computeCompositeRisk,
  fallbackCompletionScore,
} from "@/lib/code-analysis/scoring";
import type { CodeAnalysisPullRequest } from "@/lib/code-analysis/types";
import { determineActorType } from "@/lib/audit-helpers";

export type EnrichCodeAnalysisResult =
  | { status: "enriched"; scored: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

const BATCH_SIZE = 15;

export async function enrichCodeAnalysisForOrg(
  organizationId: string,
): Promise<EnrichCodeAnalysisResult> {
  const github = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "GITHUB",
      },
    },
  });

  if (!github || github.status !== "CONNECTED") {
    return { status: "skipped", reason: "github_not_connected" };
  }

  const pending = await prisma.codeAnalysisPullRequest.findMany({
    where: {
      organizationId,
      OR: [{ riskScore: null }, { completionScore: null, jiraKeysJson: { not: "[]" } }],
    },
    orderBy: { mergedAt: "desc" },
    take: BATCH_SIZE,
  });

  if (pending.length === 0) {
    return { status: "skipped", reason: "nothing_to_score" };
  }

  const allKeys = [
    ...new Set(
      pending.flatMap((row) => {
        return readJsonField<string[]>(row.jiraKeysJson, []);
      }),
    ),
  ];

  // Fetch issue texts so linked tickets remain available for future scoring.
  await fetchJiraIssueTexts(organizationId, allKeys);

  let scored = 0;

  for (const row of pending) {
    let jiraKeys: string[] = [];
    try {
      jiraKeys = readJsonField<string[]>(row.jiraKeysJson, []);
    } catch {
      jiraKeys = [];
    }

    const diffExcerpt = row.diffExcerpt ?? "";
    let completionScore = row.completionScore;
    let completionRationale = row.completionRationale;

    const needsCompletion = completionScore == null && jiraKeys.length > 0;

    if (needsCompletion) {
      if (jiraKeys.length === 0) {
        const fallback = fallbackCompletionScore({
          jiraKeys,
          hasDiff: Boolean(diffExcerpt),
          diffExcerpt,
        });
        completionScore = fallback.completionScore;
        completionRationale = fallback.completionRationale;
      } else if (!diffExcerpt) {
        const fallback = fallbackCompletionScore({ jiraKeys, hasDiff: false });
        completionScore = fallback.completionScore;
        completionRationale = fallback.completionRationale;
      } else {
        const fallback = fallbackCompletionScore({
          jiraKeys,
          hasDiff: true,
          diffExcerpt,
        });
        completionScore = fallback.completionScore;
        completionRationale = fallback.completionRationale;
      }
    } else if (completionScore == null && jiraKeys.length === 0) {
      const fallback = fallbackCompletionScore({ jiraKeys: [], hasDiff: Boolean(diffExcerpt) });
      completionRationale = fallback.completionRationale;
    }

    const prForRisk = {
      id: row.externalId,
      number: row.number,
      title: row.title,
      repo: row.repo,
      author: row.author,
      mergedAt: row.mergedAt.toISOString(),
      url: row.url,
      linesAdded: row.linesAdded,
      linesRemoved: row.linesRemoved,
      attribution: row.attribution as "human_only" | "ai_assisted" | "ai_generated" | "unknown",
      confidence: row.confidence,
      reviewCount: row.reviewCount,
      reviewers: readJsonField(row.reviewersJson, []) as string[],
      files: readJsonField(row.filesJson, []) as NonNullable<
        CodeAnalysisPullRequest["files"]
      >,
      tools: readJsonField(row.toolsJson, []) as string[],
      jiraKeys,
      diffExcerpt: diffExcerpt || undefined,
      completionScore,
      completionRationale,
    };

    const risk = computeCompositeRisk(prForRisk);

    await prisma.codeAnalysisPullRequest.update({
      where: {
        organizationId_externalId: {
          organizationId,
          externalId: row.externalId,
        },
      },
      data: {
        completionScore,
        completionRationale,
        riskScore: risk.riskScore,
        riskLevel: risk.riskLevel,
        qualityFlagsJson: JSON.stringify(risk.qualityFlags),
      },
    });

    scored += 1;
  }

  if (scored > 0) {
    await prisma.activityEvent.create({
      data: {
        organizationId,
        type: "code_analysis.enriched",
        title: "Code analysis scores updated",
        description: `Scored ${scored} pull request${scored === 1 ? "" : "s"} for completion and AI risk.`,
        metadataJson: JSON.stringify({ scored }),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: null,
        action: "code_analysis.enriched",
        entityType: "Organization",
        entityId: organizationId,
        metadataJson: JSON.stringify({ scored }),
        actorType: determineActorType(null, "code_analysis.enriched"),
      },
    });

    const { evaluateCompliance } = await import("@/lib/compliance/evaluate");
    void evaluateCompliance(organizationId, "enrich").catch((error) => {
      console.error(
        `[compliance] enrich-phase evaluation failed for org ${organizationId}`,
        error,
      );
    });
  }

  return { status: "enriched", scored };
}
