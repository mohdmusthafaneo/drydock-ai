/**
 * Signal Integrity detectors + trust rollup + finding generation.
 * Priority: never-failed → flake → retry-masked → skipped → permafail → signal decay.
 */

import { prisma } from "@/lib/prisma";
import { tokenJaccard } from "@/lib/drydock/identity";
import type {
  AttentionVerb,
  FindingSeverity,
  TestOutcome,
  TrustDeficitReason,
} from "@/generated/prisma/client";

const PERMAFAIL_MIN_FAILS = 10;
const FLAKE_MIN_DIVERGENT = 1;
const RETRY_RATIO = 0.3;
const RETRY_MIN = 5;
const NEVER_FAILED_MIN_PASSES = 20;

type ExecAgg = {
  testCaseId: string;
  executionCount: number;
  failCount: number;
  passCount: number;
  skipCount: number;
  retryPassCount: number;
  lastOutcome: TestOutcome | null;
  lastExecutedAt: Date | null;
  flakeScore: number;
  deficitReason: TrustDeficitReason;
  trusted: boolean;
  evidenceSummary: string | null;
};

async function loadExecutionStats(organizationId: string): Promise<
  Map<
    string,
    {
      executions: Array<{
        outcome: TestOutcome;
        passedOnRetry: boolean;
        executedAt: Date;
        ciRunId: string;
        commitSha: string;
      }>;
    }
  >
> {
  const rows = await prisma.testExecution.findMany({
    where: { organizationId },
    select: {
      testCaseId: true,
      outcome: true,
      passedOnRetry: true,
      executedAt: true,
      ciRunId: true,
      ciRun: { select: { commitSha: true } },
    },
    orderBy: { executedAt: "desc" },
    take: 50_000,
  });

  const map = new Map<
    string,
    {
      executions: Array<{
        outcome: TestOutcome;
        passedOnRetry: boolean;
        executedAt: Date;
        ciRunId: string;
        commitSha: string;
      }>;
    }
  >();

  for (const row of rows) {
    const bucket = map.get(row.testCaseId) ?? { executions: [] };
    bucket.executions.push({
      outcome: row.outcome,
      passedOnRetry: row.passedOnRetry,
      executedAt: row.executedAt,
      ciRunId: row.ciRunId,
      commitSha: row.ciRun.commitSha,
    });
    map.set(row.testCaseId, bucket);
  }
  return map;
}

function classify(stats: {
  executionCount: number;
  failCount: number;
  passCount: number;
  skipCount: number;
  retryPassCount: number;
  flakeScore: number;
  lastOutcome: TestOutcome | null;
}): { deficitReason: TrustDeficitReason; trusted: boolean; evidenceSummary: string } {
  const {
    executionCount,
    failCount,
    passCount,
    skipCount,
    retryPassCount,
    flakeScore,
    lastOutcome,
  } = stats;

  if (skipCount > 0 && passCount + failCount === 0) {
    return {
      deficitReason: "SKIPPED",
      trusted: false,
      evidenceSummary: `Skipped across ${skipCount} recorded runs.`,
    };
  }

  if (failCount >= PERMAFAIL_MIN_FAILS && failCount === executionCount) {
    return {
      deficitReason: "PERMAFAIL",
      trusted: false,
      evidenceSummary: `Red for ${failCount} consecutive recorded executions.`,
    };
  }

  if (flakeScore >= FLAKE_MIN_DIVERGENT) {
    return {
      deficitReason: "FLAKE",
      trusted: false,
    evidenceSummary: `Same commit produced divergent outcomes (${flakeScore} commit ${flakeScore === 1 ? "conflict" : "conflicts"}).`,
    };
  }

  if (
    retryPassCount >= RETRY_MIN &&
    passCount > 0 &&
    retryPassCount / passCount >= RETRY_RATIO
  ) {
    return {
      deficitReason: "RETRY_MASKED",
      trusted: false,
      evidenceSummary: `${retryPassCount} of ${passCount} passes required retry.`,
    };
  }

  if (failCount === 0 && passCount >= NEVER_FAILED_MIN_PASSES) {
    return {
      deficitReason: "NEVER_FAILED",
      trusted: false,
      evidenceSummary: `${passCount} consecutive passes with no recorded failure.`,
    };
  }

  if (
    failCount > 0 &&
    failCount <= 3 &&
    passCount >= NEVER_FAILED_MIN_PASSES &&
    lastOutcome === "PASSED" &&
    flakeScore === 0 &&
    (passCount === 0 || retryPassCount / passCount < RETRY_RATIO)
  ) {
    return {
      deficitReason: "SIGNAL_DECAY",
      trusted: false,
      evidenceSummary:
        "Failures look like flakes; no confirmed regression caught recently.",
    };
  }

  return {
    deficitReason: "NONE",
    trusted: true,
    evidenceSummary: `${executionCount} executions · ${failCount} fails · last ${lastOutcome ?? "unknown"}`,
  };
}

function flakeScoreFor(
  executions: Array<{ outcome: TestOutcome; commitSha: string }>,
): number {
  const byCommit = new Map<string, Set<TestOutcome>>();
  for (const ex of executions) {
    if (ex.outcome === "SKIPPED") continue;
    const set = byCommit.get(ex.commitSha) ?? new Set();
    set.add(ex.outcome);
    byCommit.set(ex.commitSha, set);
  }
  let conflicts = 0;
  for (const set of byCommit.values()) {
    if (set.has("PASSED") && (set.has("FAILED") || set.has("ERROR"))) {
      conflicts += 1;
    }
  }
  return conflicts;
}

export async function recomputeTrustForOrganization(
  organizationId: string,
): Promise<number> {
  const testCases = await prisma.testCase.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const execMap = await loadExecutionStats(organizationId);
  let updated = 0;

  for (const tc of testCases) {
    const bucket = execMap.get(tc.id);
    const executions = bucket?.executions ?? [];
    let failCount = 0;
    let passCount = 0;
    let skipCount = 0;
    let retryPassCount = 0;
    for (const ex of executions) {
      if (ex.outcome === "PASSED") {
        passCount += 1;
        if (ex.passedOnRetry) retryPassCount += 1;
      } else if (ex.outcome === "SKIPPED") skipCount += 1;
      else failCount += 1;
    }
    const last = executions[0] ?? null;
    const flakeScore = flakeScoreFor(executions);
    const classified = classify({
      executionCount: executions.length,
      failCount,
      passCount,
      skipCount,
      retryPassCount,
      flakeScore,
      lastOutcome: last?.outcome ?? null,
    });

    const agg: ExecAgg = {
      testCaseId: tc.id,
      executionCount: executions.length,
      failCount,
      passCount,
      skipCount,
      retryPassCount,
      lastOutcome: last?.outcome ?? null,
      lastExecutedAt: last?.executedAt ?? null,
      flakeScore,
      deficitReason: classified.deficitReason,
      trusted: classified.trusted,
      evidenceSummary: classified.evidenceSummary,
    };

    await prisma.testTrustState.upsert({
      where: { testCaseId: tc.id },
      create: {
        organizationId,
        testCaseId: tc.id,
        trusted: agg.trusted,
        deficitReason: agg.deficitReason,
        executionCount: agg.executionCount,
        failCount: agg.failCount,
        passCount: agg.passCount,
        skipCount: agg.skipCount,
        retryPassCount: agg.retryPassCount,
        flakeScore: agg.flakeScore,
        lastOutcome: agg.lastOutcome,
        lastExecutedAt: agg.lastExecutedAt,
        evidenceSummary: agg.evidenceSummary,
        recomputedAt: new Date(),
      },
      update: {
        trusted: agg.trusted,
        deficitReason: agg.deficitReason,
        executionCount: agg.executionCount,
        failCount: agg.failCount,
        passCount: agg.passCount,
        skipCount: agg.skipCount,
        retryPassCount: agg.retryPassCount,
        flakeScore: agg.flakeScore,
        lastOutcome: agg.lastOutcome,
        lastExecutedAt: agg.lastExecutedAt,
        evidenceSummary: agg.evidenceSummary,
        recomputedAt: new Date(),
      },
    });
    updated += 1;
  }

  await flagSemanticDuplicates(organizationId);
  await refreshOpenFindings(organizationId);
  return updated;
}

function verbFor(reason: TrustDeficitReason): AttentionVerb {
  switch (reason) {
    case "FLAKE":
      return "ROUTE";
    case "RETRY_MASKED":
      return "SNOOZE";
    case "PERMAFAIL":
      return "SIGN_OFF";
    default:
      return "RULE";
  }
}

function severityFor(reason: TrustDeficitReason): FindingSeverity {
  switch (reason) {
    case "NEVER_FAILED":
    case "FLAKE":
    case "PERMAFAIL":
      return "HIGH";
    case "RETRY_MASKED":
    case "SKIPPED":
      return "MEDIUM";
    default:
      return "LOW";
  }
}

function titleFor(
  reason: TrustDeficitReason,
  testName: string,
  clusterSize: number,
): string {
  switch (reason) {
    case "NEVER_FAILED":
      return clusterSize > 1
        ? `Always-green cluster (${clusterSize})`
        : `Always green: ${testName}`;
    case "FLAKE":
      return `Unstable on the same commit: ${testName}`;
    case "RETRY_MASKED":
      return `Only passes on retry: ${testName}`;
    case "SKIPPED":
      return `Skipped or disabled: ${testName}`;
    case "PERMAFAIL":
      return `Always failing: ${testName}`;
    case "SIGNAL_DECAY":
      return `Hasn’t caught a real bug lately: ${testName}`;
    case "SEMANTIC_DUPLICATE":
      return clusterSize > 1
        ? `Near-duplicate tests (${clusterSize})`
        : `Near-duplicate: ${testName}`;
    default:
      return testName;
  }
}

/**
 * Rebuild OPEN findings from current trust states.
 * Preserves RULED findings (architect decisions stay on the record).
 */
export async function refreshOpenFindings(organizationId: string): Promise<number> {
  await prisma.finding.deleteMany({
    where: {
      organizationId,
      status: { in: ["OPEN", "DEMOTED"] },
    },
  });

  const untrusted = await prisma.testTrustState.findMany({
    where: {
      organizationId,
      trusted: false,
      deficitReason: { not: "NONE" },
    },
    include: {
      testCase: true,
    },
    orderBy: { recomputedAt: "desc" },
  });

  // Cluster by reason + repository (+ error fingerprint when flake/permafail)
  const clusters = new Map<string, typeof untrusted>();
  for (const row of untrusted) {
    const key = `${row.deficitReason}|${row.testCase.repository}`;
    const list = clusters.get(key) ?? [];
    list.push(row);
    clusters.set(key, list);
  }

  let created = 0;
  for (const [clusterKey, members] of clusters) {
    const primary = members[0];
    if (!primary) continue;
    const reason = primary.deficitReason;
    const chips = [primary.testCase.repository, "CI results"];
    if (reason === "NEVER_FAILED" || reason === "SEMANTIC_DUPLICATE") {
      chips.push("Inference");
    }

    await prisma.finding.create({
      data: {
        organizationId,
        testCaseId: primary.testCaseId,
        reason,
        status: "OPEN",
        verb: verbFor(reason),
        severity: severityFor(reason),
        title: titleFor(reason, primary.testCase.name, members.length),
        plainSentence:
          primary.evidenceSummary ??
          `${members.length} tests marked ${reason.toLowerCase().replace(/_/g, " ")}.`,
        clusterKey,
        clusterSize: members.length,
        repository: primary.testCase.repository,
        filePath: primary.testCase.filePath,
        evidenceJson: {
          repository: primary.testCase.repository,
          filePath: primary.testCase.filePath,
          runSummary: primary.evidenceSummary,
          memberTestIds: members.map((m) => m.testCaseId),
        },
        inference: reason === "NEVER_FAILED" || reason === "SEMANTIC_DUPLICATE",
        estimatedMinutes: Math.min(8, Math.max(2, members.length + 1)),
        sinceLastRelease: true,
        demoted: false,
        sourceChipsJson: chips,
      },
    });
    created += 1;
  }

  return created;
}

const SEMANTIC_DUP_THRESHOLD = 0.85;

async function flagSemanticDuplicates(organizationId: string): Promise<void> {
  const cases = await prisma.testCase.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      filePath: true,
      repository: true,
      trustState: { select: { trusted: true, deficitReason: true } },
    },
    take: 800,
  });

  const marked = new Set<string>();
  for (let i = 0; i < cases.length; i++) {
    const a = cases[i]!;
    if (a.trustState && !a.trustState.trusted) continue;
    for (let j = i + 1; j < cases.length; j++) {
      const b = cases[j]!;
      if (a.repository !== b.repository) continue;
      if (tokenJaccard(a.name, b.name) < SEMANTIC_DUP_THRESHOLD) continue;
      for (const row of [a, b]) {
        if (marked.has(row.id)) continue;
        if (row.trustState && !row.trustState.trusted) continue;
        marked.add(row.id);
        await prisma.testTrustState.updateMany({
          where: { organizationId, testCaseId: row.id, trusted: true },
          data: {
            trusted: false,
            deficitReason: "SEMANTIC_DUPLICATE",
            evidenceSummary: `Name/path overlap with another test in ${row.repository} (inference from text plane).`,
            recomputedAt: new Date(),
          },
        });
      }
    }
  }
}
