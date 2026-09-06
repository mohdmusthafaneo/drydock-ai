/**
 * Load Briefing / Ledger view models from DryDock tables.
 * Falls back to mock when the org has no trust states yet.
 */

import { prisma } from "@/lib/prisma";
import {
  MOCK_BRIEFING,
  MOCK_LEDGER,
  type AttentionVerb,
  type FindingSeverity,
  type MockBriefing,
  type MockFinding,
  type MockLedger,
  type MockTestCase,
  type MockTrustBucket,
  type TrustDeficitReason,
} from "@/lib/drydock/mock-data";
import type {
  AttentionVerb as DbVerb,
  FindingSeverity as DbSeverity,
  TestOutcome,
  TrustDeficitReason as DbReason,
} from "@/generated/prisma/client";

const REASON_MAP: Record<DbReason, TrustDeficitReason | null> = {
  NEVER_FAILED: "never_failed",
  FLAKE: "flake",
  RETRY_MASKED: "retry_masked",
  SKIPPED: "skipped",
  PERMAFAIL: "permafail",
  SIGNAL_DECAY: "signal_decay",
  SEMANTIC_DUPLICATE: "semantic_duplicate",
  NONE: null,
};

const REASON_LABEL: Record<TrustDeficitReason, string> = {
  never_failed: "Always green (never been red)",
  flake: "Unstable on the same commit",
  retry_masked: "Only passes on retry",
  skipped: "Skipped or disabled",
  permafail: "Always failing",
  signal_decay: "Hasn’t caught a real bug lately",
  semantic_duplicate: "Near-duplicate tests",
};

const REASON_SENTENCE: Record<TrustDeficitReason, (n: number) => string> = {
  never_failed: (n) =>
    `${n} ${n === 1 ? "test has" : "tests have"} never been red while their covered paths keep changing.`,
  flake: (n) =>
    `${n} ${n === 1 ? "test" : "tests"} produced different outcomes on the same commit.`,
  retry_masked: (n) =>
    n === 1
      ? "1 test only passes on a second attempt — the pipeline stays green even though the first run failed."
      : `${n} tests only pass on a second attempt — the pipeline stays green even though the first run failed.`,
  skipped: (n) =>
    `${n} ${n === 1 ? "test is" : "tests are"} skipped or disabled; the disabled count is rising.`,
  permafail: (n) =>
    `${n} ${n === 1 ? "test has" : "tests have"} been failing for a long time and ${n === 1 ? "is" : "are"} being worked around.`,
  signal_decay: (n) =>
    `${n} ${n === 1 ? "suite has" : "suites have"} not caught a confirmed regression recently despite running green.`,
  semantic_duplicate: (n) =>
    `${n} ${n === 1 ? "test looks" : "tests look"} like a near-duplicate of another check (educated guess from names).`,
};

function mapVerb(verb: DbVerb): AttentionVerb {
  switch (verb) {
    case "RULE":
      return "rule";
    case "ROUTE":
      return "route";
    case "SNOOZE":
      return "snooze";
    case "SIGN_OFF":
      return "sign_off";
  }
}

function mapSeverity(severity: DbSeverity): FindingSeverity {
  switch (severity) {
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
  }
}

function mapOutcome(outcome: TestOutcome | null): MockTestCase["lastOutcome"] {
  if (outcome === "FAILED" || outcome === "ERROR") return "failed";
  if (outcome === "SKIPPED") return "skipped";
  return "passed";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function mapCategory(category: string): MockTestCase["category"] {
  const lower = category.toLowerCase();
  if (
    lower === "e2e" ||
    lower === "contract" ||
    lower === "smoke" ||
    lower === "unit"
  ) {
    return lower;
  }
  return "unit";
}

function asEvidence(value: unknown): MockFinding["evidence"] {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    repository: typeof obj.repository === "string" ? obj.repository : "unknown",
    filePath: typeof obj.filePath === "string" ? obj.filePath : "unknown",
    runSummary:
      typeof obj.runSummary === "string" ? obj.runSummary : "No run summary",
    errorText: typeof obj.errorText === "string" ? obj.errorText : undefined,
  };
}

async function sampleTestsForReason(
  organizationId: string,
  reason: DbReason,
  limit = 5,
): Promise<MockTestCase[]> {
  const rows = await prisma.testTrustState.findMany({
    where: { organizationId, deficitReason: reason, trusted: false },
    include: { testCase: true },
    take: limit,
    orderBy: { executionCount: "desc" },
  });

  return rows.map((row) => ({
    id: row.testCase.id,
    name: row.testCase.name,
    suitePath: row.testCase.suitePath,
    filePath: row.testCase.filePath,
    repository: row.testCase.repository,
    category: mapCategory(row.testCase.category),
    lastOutcome: mapOutcome(row.lastOutcome),
    executionCount: row.executionCount,
    failCount: row.failCount,
    retryPassCount: row.retryPassCount,
    lastSeenAt: (row.lastExecutedAt ?? row.recomputedAt).toISOString(),
    evidenceSummary: row.evidenceSummary ?? "No evidence summary.",
  }));
}

export async function loadLedger(organizationId: string): Promise<{
  ledger: MockLedger;
  source: "db" | "mock";
}> {
  const trustCount = await prisma.testTrustState.count({
    where: { organizationId },
  });
  if (trustCount === 0) {
    return { ledger: MOCK_LEDGER, source: "mock" };
  }

  const [totalTests, trustedCount, runsAnalyzed, repos, blind] = await Promise.all([
    prisma.testCase.count({ where: { organizationId } }),
    prisma.testTrustState.count({
      where: { organizationId, trusted: true },
    }),
    prisma.ciRun.count({ where: { organizationId } }),
    prisma.ciRun.findMany({
      where: { organizationId },
      distinct: ["repository"],
      select: { repository: true },
    }),
    prisma.finding.findMany({
      where: { organizationId, demoted: true },
      take: 1,
      select: { id: true },
    }),
  ]);

  const untrustedCount = totalTests - trustedCount;
  const reasons: TrustDeficitReason[] = [
    "never_failed",
    "flake",
    "retry_masked",
    "skipped",
    "permafail",
    "signal_decay",
    "semantic_duplicate",
  ];

  const buckets: MockTrustBucket[] = [];
  for (const reason of reasons) {
    const dbReason = reason.toUpperCase() as DbReason;
    const count = await prisma.testTrustState.count({
      where: { organizationId, deficitReason: dbReason, trusted: false },
    });
    buckets.push({
      reason,
      label: REASON_LABEL[reason],
      count,
      plainSentence: REASON_SENTENCE[reason](count),
      tests: await sampleTestsForReason(organizationId, dbReason),
    });
  }

  const latestRun = await prisma.ciRun.findFirst({
    where: { organizationId },
    orderBy: { ingestedAt: "desc" },
    select: { ingestedAt: true },
  });

  return {
    source: "db",
    ledger: {
      asOf: (latestRun?.ingestedAt ?? new Date()).toISOString(),
      repositoriesAnalyzed: repos.length,
      runsAnalyzed,
      totalTests,
      trustedCount,
      untrustedCount: Math.max(0, untrustedCount),
      sinceLastReleaseLabel: "since last release",
      blindSpots: blind.length
        ? ["Items covered by earlier decisions — open from Today or Tests"]
        : ["Connect GitHub and sync to ingest JUnit artifacts, or seed the pilot"],
      buckets,
    },
  };
}

export async function loadBriefing(organizationId: string): Promise<{
  briefing: MockBriefing;
  source: "db" | "mock";
}> {
  const { ledger, source } = await loadLedger(organizationId);
  if (source === "mock") {
    return { briefing: MOCK_BRIEFING, source: "mock" };
  }

  const [openFindings, demotedCount, ruled] = await Promise.all([
    prisma.finding.findMany({
      where: { organizationId, status: "OPEN", demoted: false },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      take: 8,
      include: {
        testCase: { include: { trustState: true } },
      },
    }),
    prisma.finding.count({
      where: { organizationId, demoted: true },
    }),
    prisma.finding.count({
      where: { organizationId, status: "RULED" },
    }),
  ]);

  // severity enum order HIGH < MEDIUM < LOW alphabetically is wrong — sort manually
  const severityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  openFindings.sort(
    (a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9),
  );

  const findings: MockFinding[] = [];
  for (const f of openFindings) {
    const reason = REASON_MAP[f.reason];
    if (!reason) continue;
    const memberIds =
      f.evidenceJson &&
      typeof f.evidenceJson === "object" &&
      Array.isArray((f.evidenceJson as { memberTestIds?: unknown }).memberTestIds)
        ? ((f.evidenceJson as { memberTestIds: string[] }).memberTestIds)
        : f.testCaseId
          ? [f.testCaseId]
          : [];

    const tests =
      memberIds.length > 0
        ? await prisma.testCase.findMany({
            where: { organizationId, id: { in: memberIds.slice(0, 5) } },
            include: { trustState: true },
          })
        : f.testCase
          ? [f.testCase]
          : [];

    findings.push({
      id: f.id,
      verb: mapVerb(f.verb),
      title: f.title,
      plainSentence: f.plainSentence,
      clusterSize: f.clusterSize,
      reason,
      severity: mapSeverity(f.severity),
      sourceChips: asStringArray(f.sourceChipsJson),
      estimatedMinutes: f.estimatedMinutes,
      sinceLastRelease: f.sinceLastRelease,
      inference: f.inference,
      evidence: asEvidence({
        ...(typeof f.evidenceJson === "object" && f.evidenceJson
          ? f.evidenceJson
          : {}),
        repository: f.repository,
        filePath: f.filePath,
      }),
      tests: tests.map((t) => ({
        id: t.id,
        name: t.name,
        suitePath: t.suitePath,
        filePath: t.filePath,
        repository: t.repository,
        category: mapCategory(t.category),
        lastOutcome: mapOutcome(t.trustState?.lastOutcome ?? null),
        executionCount: t.trustState?.executionCount ?? 0,
        failCount: t.trustState?.failCount ?? 0,
        retryPassCount: t.trustState?.retryPassCount ?? 0,
        lastSeenAt: t.lastSeenAt.toISOString(),
        evidenceSummary: t.trustState?.evidenceSummary ?? "No evidence summary.",
      })),
    });
  }

  const queueMinutes = findings.reduce((s, f) => s + f.estimatedMinutes, 0);

  return {
    source: "db",
    briefing: {
      asOf: ledger.asOf,
      queueMinutes: queueMinutes || 20,
      silence: findings.length === 0 && ruled >= 0,
      nextReleaseLabel: "in four days",
      demotedCount,
      demotedSummary: `${demotedCount} items look covered by earlier decisions`,
      findings,
      ledger,
    },
  };
}

export async function loadSuppressed(organizationId: string) {
  const rows = await prisma.finding.findMany({
    where: {
      organizationId,
      OR: [{ demoted: true }, { status: "RULED" }],
    },
    include: {
      rulings: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return rows.map((f) => ({
    id: f.id,
    title: f.title,
    plainSentence: f.plainSentence,
    demoted: f.demoted,
    status: f.status,
    reasonCode: f.rulings[0]?.reasonCode ?? null,
    scopeSummary: f.rulings[0]?.scopeSummary ?? null,
  }));
}
