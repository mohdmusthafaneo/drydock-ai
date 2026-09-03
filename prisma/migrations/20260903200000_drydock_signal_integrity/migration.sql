-- CreateEnum
CREATE TYPE "CiRunConclusion" AS ENUM ('SUCCESS', 'FAILURE', 'CANCELLED', 'SKIPPED', 'NEUTRAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TestOutcome" AS ENUM ('PASSED', 'FAILED', 'SKIPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "TestCategory" AS ENUM ('E2E', 'CONTRACT', 'SMOKE', 'UNIT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TestLifecycleState" AS ENUM ('ACTIVE', 'SKIPPED', 'QUARANTINED', 'RETIRED');

-- CreateEnum
CREATE TYPE "TrustDeficitReason" AS ENUM ('NEVER_FAILED', 'FLAKE', 'RETRY_MASKED', 'SKIPPED', 'PERMAFAIL', 'SIGNAL_DECAY', 'NONE');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'RULED', 'DEMOTED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AttentionVerb" AS ENUM ('RULE', 'ROUTE', 'SNOOZE', 'SIGN_OFF');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "RulingReasonCode" AS ENUM ('INTENTIONAL_THIS_TEST', 'CORRECT_FOR_KIND', 'REQUIRED_BY_INTEGRATION', 'KNOWN_BEING_FIXED', 'ACCEPTED_RISK', 'FINDING_WRONG', 'CUSTOM');

-- CreateTable
CREATE TABLE "CiRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "workflowName" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "conclusion" "CiRunConclusion" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "htmlUrl" TEXT,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "suitePath" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "category" "TestCategory" NOT NULL DEFAULT 'UNKNOWN',
    "lifecycleState" "TestLifecycleState" NOT NULL DEFAULT 'ACTIVE',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCaseAlias" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "suitePath" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestCaseAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "ciRunId" TEXT NOT NULL,
    "outcome" "TestOutcome" NOT NULL,
    "durationMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "passedOnRetry" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "errorFingerprint" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestExecution_pkey" PRIMARY KEY ("id","executedAt")
);

-- CreateTable
CREATE TABLE "TestTrustState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "trusted" BOOLEAN NOT NULL DEFAULT true,
    "deficitReason" "TrustDeficitReason" NOT NULL DEFAULT 'NONE',
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "passCount" INTEGER NOT NULL DEFAULT 0,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "retryPassCount" INTEGER NOT NULL DEFAULT 0,
    "flakeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastOutcome" "TestOutcome",
    "lastExecutedAt" TIMESTAMP(3),
    "evidenceSummary" TEXT,
    "recomputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestTrustState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "testCaseId" TEXT,
    "reason" "TrustDeficitReason" NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "verb" "AttentionVerb" NOT NULL DEFAULT 'RULE',
    "severity" "FindingSeverity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "plainSentence" TEXT NOT NULL,
    "clusterKey" TEXT NOT NULL,
    "clusterSize" INTEGER NOT NULL DEFAULT 1,
    "repository" TEXT,
    "filePath" TEXT,
    "evidenceJson" JSONB NOT NULL DEFAULT '{}',
    "inference" BOOLEAN NOT NULL DEFAULT false,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 5,
    "sinceLastRelease" BOOLEAN NOT NULL DEFAULT true,
    "demoted" BOOLEAN NOT NULL DEFAULT false,
    "sourceChipsJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ruling" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "reasonCode" "RulingReasonCode" NOT NULL,
    "customReason" TEXT,
    "scopeSummary" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ruling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Precedent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rulingId" TEXT NOT NULL,
    "reason" "TrustDeficitReason" NOT NULL,
    "patternKey" TEXT NOT NULL,
    "plainSentence" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ratifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Precedent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CiRun_organizationId_finishedAt_idx" ON "CiRun"("organizationId", "finishedAt");

-- CreateIndex
CREATE INDEX "CiRun_organizationId_commitSha_idx" ON "CiRun"("organizationId", "commitSha");

-- CreateIndex
CREATE INDEX "CiRun_organizationId_repository_branch_idx" ON "CiRun"("organizationId", "repository", "branch");

-- CreateIndex
CREATE UNIQUE INDEX "CiRun_organizationId_repository_workflowRunId_key" ON "CiRun"("organizationId", "repository", "workflowRunId");

-- CreateIndex
CREATE INDEX "TestCase_organizationId_repository_filePath_idx" ON "TestCase"("organizationId", "repository", "filePath");

-- CreateIndex
CREATE INDEX "TestCase_organizationId_lifecycleState_idx" ON "TestCase"("organizationId", "lifecycleState");

-- CreateIndex
CREATE UNIQUE INDEX "TestCase_organizationId_stableKey_key" ON "TestCase"("organizationId", "stableKey");

-- CreateIndex
CREATE INDEX "TestCaseAlias_organizationId_testCaseId_idx" ON "TestCaseAlias"("organizationId", "testCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TestCaseAlias_organizationId_stableKey_key" ON "TestCaseAlias"("organizationId", "stableKey");

-- CreateIndex
CREATE INDEX "TestExecution_organizationId_executedAt_idx" ON "TestExecution"("organizationId", "executedAt");

-- CreateIndex
CREATE INDEX "TestExecution_testCaseId_executedAt_idx" ON "TestExecution"("testCaseId", "executedAt");

-- CreateIndex
CREATE INDEX "TestExecution_ciRunId_executedAt_idx" ON "TestExecution"("ciRunId", "executedAt");

-- CreateIndex
CREATE INDEX "TestExecution_organizationId_errorFingerprint_idx" ON "TestExecution"("organizationId", "errorFingerprint");

-- CreateIndex
CREATE INDEX "TestExecution_organizationId_testCaseId_outcome_idx" ON "TestExecution"("organizationId", "testCaseId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "TestTrustState_testCaseId_key" ON "TestTrustState"("testCaseId");

-- CreateIndex
CREATE INDEX "TestTrustState_organizationId_trusted_idx" ON "TestTrustState"("organizationId", "trusted");

-- CreateIndex
CREATE INDEX "TestTrustState_organizationId_deficitReason_idx" ON "TestTrustState"("organizationId", "deficitReason");

-- CreateIndex
CREATE INDEX "Finding_organizationId_status_createdAt_idx" ON "Finding"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Finding_organizationId_reason_status_idx" ON "Finding"("organizationId", "reason", "status");

-- CreateIndex
CREATE INDEX "Finding_organizationId_clusterKey_idx" ON "Finding"("organizationId", "clusterKey");

-- CreateIndex
CREATE INDEX "Finding_organizationId_demoted_idx" ON "Finding"("organizationId", "demoted");

-- CreateIndex
CREATE INDEX "Ruling_organizationId_createdAt_idx" ON "Ruling"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Ruling_findingId_idx" ON "Ruling"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "Precedent_rulingId_key" ON "Precedent"("rulingId");

-- CreateIndex
CREATE INDEX "Precedent_organizationId_active_reason_idx" ON "Precedent"("organizationId", "active", "reason");

-- CreateIndex
CREATE INDEX "Precedent_organizationId_patternKey_idx" ON "Precedent"("organizationId", "patternKey");

-- AddForeignKey
ALTER TABLE "CiRun" ADD CONSTRAINT "CiRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseAlias" ADD CONSTRAINT "TestCaseAlias_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseAlias" ADD CONSTRAINT "TestCaseAlias_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestExecution" ADD CONSTRAINT "TestExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestExecution" ADD CONSTRAINT "TestExecution_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestExecution" ADD CONSTRAINT "TestExecution_ciRunId_fkey" FOREIGN KEY ("ciRunId") REFERENCES "CiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestTrustState" ADD CONSTRAINT "TestTrustState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestTrustState" ADD CONSTRAINT "TestTrustState_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ruling" ADD CONSTRAINT "Ruling_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ruling" ADD CONSTRAINT "Ruling_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Precedent" ADD CONSTRAINT "Precedent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Precedent" ADD CONSTRAINT "Precedent_rulingId_fkey" FOREIGN KEY ("rulingId") REFERENCES "Ruling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Timescale hypertable for TestExecution (partition: executedAt)
SELECT create_hypertable(
  '"TestExecution"',
  'executedAt',
  migrate_data => true,
  if_not_exists => true
);
ALTER TABLE "TestExecution" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = '"organizationId"',
  timescaledb.compress_orderby = '"executedAt" DESC'
);
SELECT add_compression_policy('"TestExecution"', INTERVAL '7 days', if_not_exists => true);
SELECT add_retention_policy('"TestExecution"', INTERVAL '180 days', if_not_exists => true);
