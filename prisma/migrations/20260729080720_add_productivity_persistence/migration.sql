-- CreateEnum
CREATE TYPE "ProductivityAnalysisRunStatus" AS ENUM ('PERSISTED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductivityActivityDimension" AS ENUM ('WEEKDAY', 'HOUR_IST', 'COMMIT_SIZE_ADDED');

-- CreateEnum
CREATE TYPE "ProductivityInsightKind" AS ENUM ('WENT_WELL', 'RISK', 'RECOMMENDATION');

-- DropIndex
DROP INDEX "ActivityEvent_createdAt_idx";

-- DropIndex
DROP INDEX "AuditLog_createdAt_idx";

-- DropIndex
DROP INDEX "DeploymentEvent_deployedAt_idx";

-- DropIndex
DROP INDEX "DeploymentEvent_organizationId_idx";

-- DropIndex
DROP INDEX "Embedding_vector_hnsw_idx";

-- DropIndex
DROP INDEX "TelemetryEvent_occurredAt_idx";

-- DropIndex
DROP INDEX "TelemetryMetric_recordedAt_idx";

-- DropIndex
DROP INDEX "WebhookEvent_receivedAt_idx";

-- CreateTable
CREATE TABLE "ProductivityAnalysisRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "repositoryName" TEXT NOT NULL,
    "repositoryUrl" TEXT,
    "branch" TEXT NOT NULL,
    "reportPath" TEXT NOT NULL,
    "reportSha256" TEXT NOT NULL,
    "mastraRunId" TEXT,
    "mastraTraceId" TEXT,
    "mastraThreadId" TEXT,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ProductivityAnalysisRunStatus" NOT NULL DEFAULT 'PERSISTED',
    "verifiedAt" TIMESTAMP(3),
    "verificationErrorsJson" JSONB NOT NULL DEFAULT '[]',
    "windowFirstCommit" TIMESTAMP(3),
    "windowLastCommit" TIMESTAMP(3),
    "windowCalendarDays" INTEGER,
    "windowActiveDays" INTEGER,
    "windowActiveIsoWeeks" INTEGER,
    "headlineTotalCommits" INTEGER,
    "headlineMergeCommits" INTEGER,
    "headlineNonMergeCommits" INTEGER,
    "headlineFilesTouched" INTEGER,
    "headlineLinesAddedRaw" INTEGER,
    "headlineLinesDeletedRaw" INTEGER,
    "headlineLinesAddedProduct" INTEGER,
    "headlineLinesDeletedProduct" INTEGER,
    "headlineNetGrowthRaw" INTEGER,
    "headlineNetGrowthProduct" INTEGER,
    "headlinePrsMerged" INTEGER,
    "headlineActiveDays" INTEGER,
    "headlineCalendarDays" INTEGER,
    "headlineAvgCommitsPerActiveDay" DOUBLE PRECISION,
    "headlineAvgCommitsPerCalendarDay" DOUBLE PRECISION,
    "headlineMedianCommitAdded" INTEGER,
    "headlineMedianCommitDeleted" INTEGER,
    "headlineMeanCommitAdded" INTEGER,
    "headlineMeanCommitDeleted" INTEGER,
    "headlineP90CommitAdded" INTEGER,
    "headlineMaxCommitAdded" INTEGER,
    "headlineFeatFixRatio" DOUBLE PRECISION,
    "strongestSignals" TEXT[],
    "weakestSignals" TEXT[],
    "remoteBranches" TEXT[],
    "devAheadOfMainCommits" INTEGER,
    "mainAheadOfDevCommits" INTEGER,
    "remoteBranchCount" INTEGER,
    "tlDr" TEXT NOT NULL DEFAULT '',
    "methodologyDataSource" TEXT,
    "methodologyLocNote" TEXT,
    "methodologyExclusionsNoisyFiles" TEXT,
    "methodologyExclusionsGeneratedDirs" TEXT,

    CONSTRAINT "ProductivityAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductivityContributorStat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "commits" INTEGER NOT NULL,
    "sharePct" DOUBLE PRECISION NOT NULL,
    "files" INTEGER NOT NULL,
    "linesAdded" INTEGER NOT NULL,
    "linesDeleted" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "rank" INTEGER,

    CONSTRAINT "ProductivityContributorStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductivityCommitTypeStat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "commitType" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "sharePct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProductivityCommitTypeStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductivityWeeklyVolume" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "isoWeek" TEXT NOT NULL,
    "commits" INTEGER NOT NULL,

    CONSTRAINT "ProductivityWeeklyVolume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductivityActivityBucket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "dimension" "ProductivityActivityDimension" NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "bucketIndex" INTEGER NOT NULL,
    "commits" INTEGER NOT NULL,

    CONSTRAINT "ProductivityActivityBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductivityAreaStat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "commits" INTEGER NOT NULL,
    "files" INTEGER NOT NULL,
    "added" INTEGER NOT NULL,
    "deleted" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "rank" INTEGER,

    CONSTRAINT "ProductivityAreaStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductivityLargeCommit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "committedOn" TIMESTAMP(3),
    "authorName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "files" INTEGER NOT NULL,
    "added" INTEGER NOT NULL,
    "deleted" INTEGER NOT NULL,
    "rank" INTEGER,

    CONSTRAINT "ProductivityLargeCommit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductivityInsight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" "ProductivityInsightKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "ProductivityInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductivityAnalysisRun_organizationId_analyzedAt_idx" ON "ProductivityAnalysisRun"("organizationId", "analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductivityAnalysisRun_organizationId_repositoryName_branc_key" ON "ProductivityAnalysisRun"("organizationId", "repositoryName", "branch", "reportSha256");

-- CreateIndex
CREATE INDEX "ProductivityContributorStat_organizationId_authorName_idx" ON "ProductivityContributorStat"("organizationId", "authorName");

-- CreateIndex
CREATE UNIQUE INDEX "ProductivityContributorStat_runId_authorName_key" ON "ProductivityContributorStat"("runId", "authorName");

-- CreateIndex
CREATE UNIQUE INDEX "ProductivityCommitTypeStat_runId_commitType_key" ON "ProductivityCommitTypeStat"("runId", "commitType");

-- CreateIndex
CREATE INDEX "ProductivityWeeklyVolume_organizationId_isoWeek_idx" ON "ProductivityWeeklyVolume"("organizationId", "isoWeek");

-- CreateIndex
CREATE UNIQUE INDEX "ProductivityWeeklyVolume_runId_isoWeek_key" ON "ProductivityWeeklyVolume"("runId", "isoWeek");

-- CreateIndex
CREATE INDEX "ProductivityActivityBucket_organizationId_dimension_bucketK_idx" ON "ProductivityActivityBucket"("organizationId", "dimension", "bucketKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductivityActivityBucket_runId_dimension_bucketKey_key" ON "ProductivityActivityBucket"("runId", "dimension", "bucketKey");

-- CreateIndex
CREATE INDEX "ProductivityAreaStat_organizationId_area_idx" ON "ProductivityAreaStat"("organizationId", "area");

-- CreateIndex
CREATE UNIQUE INDEX "ProductivityAreaStat_runId_area_key" ON "ProductivityAreaStat"("runId", "area");

-- CreateIndex
CREATE INDEX "ProductivityLargeCommit_organizationId_committedOn_idx" ON "ProductivityLargeCommit"("organizationId", "committedOn");

-- CreateIndex
CREATE UNIQUE INDEX "ProductivityLargeCommit_runId_sha_key" ON "ProductivityLargeCommit"("runId", "sha");

-- CreateIndex
CREATE INDEX "ProductivityInsight_organizationId_kind_idx" ON "ProductivityInsight"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ProductivityInsight_runId_kind_rank_key" ON "ProductivityInsight"("runId", "kind", "rank");

-- AddForeignKey
ALTER TABLE "ProductivityContributorStat" ADD CONSTRAINT "ProductivityContributorStat_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductivityAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivityCommitTypeStat" ADD CONSTRAINT "ProductivityCommitTypeStat_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductivityAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivityWeeklyVolume" ADD CONSTRAINT "ProductivityWeeklyVolume_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductivityAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivityActivityBucket" ADD CONSTRAINT "ProductivityActivityBucket_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductivityAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivityAreaStat" ADD CONSTRAINT "ProductivityAreaStat_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductivityAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivityLargeCommit" ADD CONSTRAINT "ProductivityLargeCommit_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductivityAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductivityInsight" ADD CONSTRAINT "ProductivityInsight_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductivityAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
