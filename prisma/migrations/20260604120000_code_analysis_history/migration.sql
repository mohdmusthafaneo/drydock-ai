-- CreateTable
CREATE TABLE "CodeAnalysisRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "repoFullNamesJson" TEXT NOT NULL DEFAULT '[]',
    "commitCount" INTEGER NOT NULL DEFAULT 0,
    "prCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeAnalysisCommit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "attribution" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "signalsJson" TEXT NOT NULL DEFAULT '[]',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeAnalysisCommit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeAnalysisPullRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "linesAdded" INTEGER NOT NULL DEFAULT 0,
    "linesRemoved" INTEGER NOT NULL DEFAULT 0,
    "attribution" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "toolsJson" TEXT NOT NULL DEFAULT '[]',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeAnalysisPullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodeAnalysisRun_organizationId_syncedAt_idx" ON "CodeAnalysisRun"("organizationId", "syncedAt");

-- CreateIndex
CREATE INDEX "CodeAnalysisCommit_organizationId_committedAt_idx" ON "CodeAnalysisCommit"("organizationId", "committedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CodeAnalysisCommit_organizationId_repo_sha_key" ON "CodeAnalysisCommit"("organizationId", "repo", "sha");

-- CreateIndex
CREATE INDEX "CodeAnalysisPullRequest_organizationId_mergedAt_idx" ON "CodeAnalysisPullRequest"("organizationId", "mergedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CodeAnalysisPullRequest_organizationId_externalId_key" ON "CodeAnalysisPullRequest"("organizationId", "externalId");

-- AddForeignKey
ALTER TABLE "CodeAnalysisRun" ADD CONSTRAINT "CodeAnalysisRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeAnalysisCommit" ADD CONSTRAINT "CodeAnalysisCommit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeAnalysisPullRequest" ADD CONSTRAINT "CodeAnalysisPullRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
