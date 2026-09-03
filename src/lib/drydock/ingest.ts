/**
 * Ingest a CI run's test report into DryDock tables.
 * Recommend-only — never writes back to GitHub.
 */

import { prisma } from "@/lib/prisma";
import {
  deriveStableKey,
  type TestIdentityParts,
} from "@/lib/drydock/identity";
import { parseJUnitXml, type ParsedJUnitCase } from "@/lib/drydock/junit";
import { recomputeTrustForOrganization } from "@/lib/drydock/detectors";
import type {
  CiRunConclusion,
  TestCategory,
  TestLifecycleState,
  TestOutcome,
} from "@/generated/prisma/client";

export type IngestCiRunInput = {
  organizationId: string;
  repository: string;
  workflowName: string;
  workflowRunId: string;
  commitSha: string;
  branch: string;
  conclusion?: CiRunConclusion;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  htmlUrl?: string | null;
  junitXml: string;
  /** Optional default file path when JUnit omits file attrs. */
  defaultFilePath?: string;
  category?: TestCategory;
};

export type IngestResult = {
  ciRunId: string;
  created: boolean;
  caseCount: number;
  executionCount: number;
  trustRecomputed: number;
};

function mapOutcome(outcome: ParsedJUnitCase["outcome"]): TestOutcome {
  switch (outcome) {
    case "passed":
      return "PASSED";
    case "failed":
      return "FAILED";
    case "skipped":
      return "SKIPPED";
    case "error":
      return "ERROR";
  }
}

function lifecycleFor(outcome: TestOutcome): TestLifecycleState {
  if (outcome === "SKIPPED") return "SKIPPED";
  return "ACTIVE";
}

async function upsertTestCase(args: {
  organizationId: string;
  repository: string;
  parsed: ParsedJUnitCase;
  defaultFilePath?: string;
  category: TestCategory;
  seenAt: Date;
}) {
  const filePath =
    args.parsed.filePath?.trim() ||
    args.defaultFilePath ||
    "unknown.spec.ts";
  const parts: TestIdentityParts = {
    repository: args.repository,
    filePath,
    suitePath: args.parsed.suitePath,
    name: args.parsed.name,
  };
  const stableKey = deriveStableKey(parts);

  const existing = await prisma.testCase.findUnique({
    where: {
      organizationId_stableKey: {
        organizationId: args.organizationId,
        stableKey,
      },
    },
  });

  if (existing) {
    return prisma.testCase.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: args.seenAt,
        filePath,
        suitePath: parts.suitePath,
        name: parts.name,
        lifecycleState: lifecycleFor(mapOutcome(args.parsed.outcome)),
        category: args.category,
      },
    });
  }

  return prisma.testCase.create({
    data: {
      organizationId: args.organizationId,
      repository: args.repository,
      filePath,
      suitePath: parts.suitePath,
      name: parts.name,
      stableKey,
      category: args.category,
      lifecycleState: lifecycleFor(mapOutcome(args.parsed.outcome)),
      firstSeenAt: args.seenAt,
      lastSeenAt: args.seenAt,
    },
  });
}

export async function ingestJUnitReport(
  input: IngestCiRunInput,
): Promise<IngestResult> {
  const parsed = parseJUnitXml(input.junitXml);
  const executedAt = input.finishedAt ?? new Date();
  const category = input.category ?? "E2E";

  const existing = await prisma.ciRun.findUnique({
    where: {
      organizationId_repository_workflowRunId: {
        organizationId: input.organizationId,
        repository: input.repository,
        workflowRunId: input.workflowRunId,
      },
    },
  });

  const ciRun = existing
    ? await prisma.ciRun.update({
        where: { id: existing.id },
        data: {
          conclusion: input.conclusion ?? existing.conclusion,
          commitSha: input.commitSha,
          branch: input.branch,
          startedAt: input.startedAt ?? existing.startedAt,
          finishedAt: input.finishedAt ?? existing.finishedAt,
          htmlUrl: input.htmlUrl ?? existing.htmlUrl,
          ingestedAt: new Date(),
        },
      })
    : await prisma.ciRun.create({
        data: {
          organizationId: input.organizationId,
          repository: input.repository,
          workflowName: input.workflowName,
          workflowRunId: input.workflowRunId,
          commitSha: input.commitSha,
          branch: input.branch,
          conclusion: input.conclusion ?? "UNKNOWN",
          startedAt: input.startedAt ?? null,
          finishedAt: input.finishedAt ?? null,
          htmlUrl: input.htmlUrl ?? null,
        },
      });

  // Re-ingest: drop prior executions for this run (Timescale-safe delete by ciRunId)
  if (existing) {
    await prisma.testExecution.deleteMany({
      where: {
        organizationId: input.organizationId,
        ciRunId: ciRun.id,
      },
    });
  }

  let executionCount = 0;
  for (const testCase of parsed.cases) {
    const row = await upsertTestCase({
      organizationId: input.organizationId,
      repository: input.repository,
      parsed: testCase,
      defaultFilePath: input.defaultFilePath,
      category,
      seenAt: executedAt,
    });

    await prisma.testExecution.create({
      data: {
        organizationId: input.organizationId,
        testCaseId: row.id,
        ciRunId: ciRun.id,
        outcome: mapOutcome(testCase.outcome),
        durationMs: testCase.durationMs,
        retryCount: testCase.retryCount,
        passedOnRetry: testCase.passedOnRetry,
        errorMessage: testCase.errorMessage,
        errorFingerprint: testCase.errorFingerprint,
        executedAt,
      },
    });
    executionCount += 1;
  }

  const trustRecomputed = await recomputeTrustForOrganization(
    input.organizationId,
  );

  return {
    ciRunId: ciRun.id,
    created: !existing,
    caseCount: parsed.cases.length,
    executionCount,
    trustRecomputed,
  };
}
