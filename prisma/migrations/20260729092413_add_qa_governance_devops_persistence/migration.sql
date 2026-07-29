-- CreateEnum
CREATE TYPE "QAAnalysisRunStatus" AS ENUM ('PERSISTED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "QAQueryPresetKind" AS ENUM ('OPEN_BUGS', 'BLOCKED', 'OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "GovernanceAnalysisRunStatus" AS ENUM ('PERSISTED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "DevOpsAccountScanRunStatus" AS ENUM ('PERSISTED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "DevOpsHygieneSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateTable
CREATE TABLE "QAAnalysisRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectScopeHash" TEXT NOT NULL,
    "reportSha256" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "QAAnalysisRunStatus" NOT NULL DEFAULT 'PERSISTED',
    "verifiedAt" TIMESTAMP(3),
    "verificationErrorsJson" JSONB NOT NULL DEFAULT '[]',
    "projectKeysCount" INTEGER,
    "headlineOpenBugsCount" INTEGER,
    "headlineBlockedCount" INTEGER,
    "headlineOpenCount" INTEGER,
    "headlineDoneCount" INTEGER,
    "headlineIssueEvidenceCount" INTEGER,

    CONSTRAINT "QAAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QAStatusStat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "preset" "QAQueryPresetKind" NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "QAStatusStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QAProjectKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,

    CONSTRAINT "QAProjectKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QAIssueEvidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "preset" "QAQueryPresetKind" NOT NULL,
    "issueKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "priority" TEXT,
    "assignee" TEXT,

    CONSTRAINT "QAIssueEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceAnalysisRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "repositoryName" TEXT NOT NULL,
    "repositoryUrl" TEXT,
    "revspec" TEXT NOT NULL,
    "reportSha256" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "GovernanceAnalysisRunStatus" NOT NULL DEFAULT 'PERSISTED',
    "verifiedAt" TIMESTAMP(3),
    "verificationErrorsJson" JSONB NOT NULL DEFAULT '[]',
    "headlineRiskScore" DOUBLE PRECISION,
    "headlineProbability" DOUBLE PRECISION,
    "headlineRiskLevel" TEXT,
    "headlineRiskPercentile" DOUBLE PRECISION,
    "headlineReviewPriority" TEXT,
    "headlineSummary" TEXT,
    "headlineDriversCount" INTEGER,
    "headlineWorstFilesCount" INTEGER,
    "headlineFindingsCount" INTEGER,
    "headlineDeadCodeFindingsCount" INTEGER,
    "headlineKpisCount" INTEGER,
    "headlineWorstFilePath" TEXT,
    "headlineWorstFileScore" DOUBLE PRECISION,

    CONSTRAINT "GovernanceAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceKpiStat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kpiKey" TEXT NOT NULL,
    "valueFloat" DOUBLE PRECISION,
    "valueString" TEXT,

    CONSTRAINT "GovernanceKpiStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceWorstFileStat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "maxCcn" INTEGER,
    "maxNesting" INTEGER,
    "nloc" INTEGER,
    "duplicationPct" DOUBLE PRECISION,
    "hasTestFile" BOOLEAN,

    CONSTRAINT "GovernanceWorstFileStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceRiskDriver" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "feature" TEXT,
    "value" DOUBLE PRECISION,
    "contribution" DOUBLE PRECISION,
    "label" TEXT,

    CONSTRAINT "GovernanceRiskDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceHealthFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "severity" TEXT,
    "biomarkerType" TEXT,
    "filePath" TEXT,
    "functionName" TEXT,
    "healthImpact" DOUBLE PRECISION,
    "reason" TEXT,

    CONSTRAINT "GovernanceHealthFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceDeadCodeFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "kind" TEXT,
    "filePath" TEXT,
    "symbol" TEXT,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "cleanupReady" BOOLEAN,

    CONSTRAINT "GovernanceDeadCodeFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevOpsAccountScanRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "roleArn" TEXT NOT NULL,
    "regionsCount" INTEGER,
    "durationMs" INTEGER,
    "reportSha256" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DevOpsAccountScanRunStatus" NOT NULL DEFAULT 'PERSISTED',
    "verifiedAt" TIMESTAMP(3),
    "verificationErrorsJson" JSONB NOT NULL DEFAULT '[]',
    "headlineResourcesCount" INTEGER,
    "headlineFindingsCount" INTEGER,
    "headlineWarningsCount" INTEGER,

    CONSTRAINT "DevOpsAccountScanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevOpsSeverityStat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "severity" "DevOpsHygieneSeverity" NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "DevOpsSeverityStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevOpsResourceTypeStat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "DevOpsResourceTypeStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevOpsResourceInventory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "region" TEXT,
    "name" TEXT,
    "arn" TEXT,

    CONSTRAINT "DevOpsResourceInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevOpsHygieneFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "checkId" TEXT NOT NULL,
    "severity" "DevOpsHygieneSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceRef" TEXT,

    CONSTRAINT "DevOpsHygieneFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevOpsAccountScanWarning" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "warningText" TEXT NOT NULL,

    CONSTRAINT "DevOpsAccountScanWarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QAAnalysisRun_organizationId_analyzedAt_idx" ON "QAAnalysisRun"("organizationId", "analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QAAnalysisRun_organizationId_projectScopeHash_reportSha256_key" ON "QAAnalysisRun"("organizationId", "projectScopeHash", "reportSha256");

-- CreateIndex
CREATE INDEX "QAStatusStat_organizationId_preset_idx" ON "QAStatusStat"("organizationId", "preset");

-- CreateIndex
CREATE UNIQUE INDEX "QAStatusStat_runId_preset_key" ON "QAStatusStat"("runId", "preset");

-- CreateIndex
CREATE INDEX "QAProjectKey_organizationId_projectKey_idx" ON "QAProjectKey"("organizationId", "projectKey");

-- CreateIndex
CREATE UNIQUE INDEX "QAProjectKey_runId_projectKey_key" ON "QAProjectKey"("runId", "projectKey");

-- CreateIndex
CREATE INDEX "QAIssueEvidence_organizationId_preset_idx" ON "QAIssueEvidence"("organizationId", "preset");

-- CreateIndex
CREATE UNIQUE INDEX "QAIssueEvidence_runId_preset_issueKey_key" ON "QAIssueEvidence"("runId", "preset", "issueKey");

-- CreateIndex
CREATE INDEX "GovernanceAnalysisRun_organizationId_analyzedAt_idx" ON "GovernanceAnalysisRun"("organizationId", "analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceAnalysisRun_organizationId_repositoryName_revspec_key" ON "GovernanceAnalysisRun"("organizationId", "repositoryName", "revspec", "reportSha256");

-- CreateIndex
CREATE INDEX "GovernanceKpiStat_organizationId_kpiKey_idx" ON "GovernanceKpiStat"("organizationId", "kpiKey");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceKpiStat_runId_kpiKey_key" ON "GovernanceKpiStat"("runId", "kpiKey");

-- CreateIndex
CREATE INDEX "GovernanceWorstFileStat_organizationId_filePath_idx" ON "GovernanceWorstFileStat"("organizationId", "filePath");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceWorstFileStat_runId_filePath_key" ON "GovernanceWorstFileStat"("runId", "filePath");

-- CreateIndex
CREATE INDEX "GovernanceRiskDriver_organizationId_rank_idx" ON "GovernanceRiskDriver"("organizationId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceRiskDriver_runId_rank_key" ON "GovernanceRiskDriver"("runId", "rank");

-- CreateIndex
CREATE INDEX "GovernanceHealthFinding_organizationId_severity_idx" ON "GovernanceHealthFinding"("organizationId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceHealthFinding_runId_rank_key" ON "GovernanceHealthFinding"("runId", "rank");

-- CreateIndex
CREATE INDEX "GovernanceDeadCodeFinding_organizationId_kind_idx" ON "GovernanceDeadCodeFinding"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceDeadCodeFinding_runId_rank_key" ON "GovernanceDeadCodeFinding"("runId", "rank");

-- CreateIndex
CREATE INDEX "DevOpsAccountScanRun_organizationId_analyzedAt_idx" ON "DevOpsAccountScanRun"("organizationId", "analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DevOpsAccountScanRun_organizationId_accountId_roleArn_repor_key" ON "DevOpsAccountScanRun"("organizationId", "accountId", "roleArn", "reportSha256");

-- CreateIndex
CREATE INDEX "DevOpsSeverityStat_organizationId_severity_idx" ON "DevOpsSeverityStat"("organizationId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "DevOpsSeverityStat_runId_severity_key" ON "DevOpsSeverityStat"("runId", "severity");

-- CreateIndex
CREATE INDEX "DevOpsResourceTypeStat_organizationId_resourceType_idx" ON "DevOpsResourceTypeStat"("organizationId", "resourceType");

-- CreateIndex
CREATE UNIQUE INDEX "DevOpsResourceTypeStat_runId_resourceType_key" ON "DevOpsResourceTypeStat"("runId", "resourceType");

-- CreateIndex
CREATE INDEX "DevOpsResourceInventory_organizationId_resourceType_region_idx" ON "DevOpsResourceInventory"("organizationId", "resourceType", "region");

-- CreateIndex
CREATE UNIQUE INDEX "DevOpsResourceInventory_runId_resourceType_resourceId_regio_key" ON "DevOpsResourceInventory"("runId", "resourceType", "resourceId", "region");

-- CreateIndex
CREATE INDEX "DevOpsHygieneFinding_organizationId_severity_idx" ON "DevOpsHygieneFinding"("organizationId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "DevOpsHygieneFinding_runId_checkId_severity_resourceType_re_key" ON "DevOpsHygieneFinding"("runId", "checkId", "severity", "resourceType", "resourceRef");

-- CreateIndex
CREATE INDEX "DevOpsAccountScanWarning_organizationId_runId_idx" ON "DevOpsAccountScanWarning"("organizationId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "DevOpsAccountScanWarning_runId_warningText_key" ON "DevOpsAccountScanWarning"("runId", "warningText");

-- AddForeignKey
ALTER TABLE "QAStatusStat" ADD CONSTRAINT "QAStatusStat_runId_fkey" FOREIGN KEY ("runId") REFERENCES "QAAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QAProjectKey" ADD CONSTRAINT "QAProjectKey_runId_fkey" FOREIGN KEY ("runId") REFERENCES "QAAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QAIssueEvidence" ADD CONSTRAINT "QAIssueEvidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "QAAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceKpiStat" ADD CONSTRAINT "GovernanceKpiStat_runId_fkey" FOREIGN KEY ("runId") REFERENCES "GovernanceAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceWorstFileStat" ADD CONSTRAINT "GovernanceWorstFileStat_runId_fkey" FOREIGN KEY ("runId") REFERENCES "GovernanceAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceRiskDriver" ADD CONSTRAINT "GovernanceRiskDriver_runId_fkey" FOREIGN KEY ("runId") REFERENCES "GovernanceAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceHealthFinding" ADD CONSTRAINT "GovernanceHealthFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "GovernanceAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceDeadCodeFinding" ADD CONSTRAINT "GovernanceDeadCodeFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "GovernanceAnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevOpsSeverityStat" ADD CONSTRAINT "DevOpsSeverityStat_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DevOpsAccountScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevOpsResourceTypeStat" ADD CONSTRAINT "DevOpsResourceTypeStat_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DevOpsAccountScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevOpsResourceInventory" ADD CONSTRAINT "DevOpsResourceInventory_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DevOpsAccountScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevOpsHygieneFinding" ADD CONSTRAINT "DevOpsHygieneFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DevOpsAccountScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevOpsAccountScanWarning" ADD CONSTRAINT "DevOpsAccountScanWarning_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DevOpsAccountScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
