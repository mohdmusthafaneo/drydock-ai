-- Phase 4: pgvector + Embedding / Evidence snapshot tables
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "EmbeddingRefType" AS ENUM ('commit', 'ticket');
CREATE TYPE "EvidenceTier" AS ENUM ('direct', 'strong', 'moderate', 'reviewable', 'low');
CREATE TYPE "EvidenceReviewDecision" AS ENUM ('confirmed', 'rejected');

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "refType" "EmbeddingRefType" NOT NULL,
    "refId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "dim" INTEGER NOT NULL DEFAULT 384,
    "vector" vector(384) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "sprintId" TEXT,
    "summary" TEXT,
    "descriptionText" TEXT,
    "assigneeName" TEXT,
    "reporterName" TEXT,
    "status" TEXT,
    "issueType" TEXT,
    "priority" TEXT,
    "labelsJson" JSONB NOT NULL DEFAULT '[]',
    "storyPoints" DOUBLE PRECISION,
    "ticketCreatedAt" TIMESTAMP(3),
    "ticketUpdatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommitSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "primaryBranch" TEXT NOT NULL,
    "authorName" TEXT,
    "authorEmail" TEXT,
    "commitDate" TIMESTAMP(3),
    "subject" TEXT,
    "body" TEXT,
    "filesTouchedJson" JSONB NOT NULL DEFAULT '[]',
    "funcSignaturesJson" JSONB NOT NULL DEFAULT '[]',
    "hunkSnippet" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketSnapshotId" TEXT NOT NULL,
    "commitSnapshotId" TEXT NOT NULL,
    "sprintId" TEXT,
    "tier" "EvidenceTier" NOT NULL,
    "authorScore" DOUBLE PRECISION NOT NULL,
    "dateScore" DOUBLE PRECISION NOT NULL,
    "keywordScore" DOUBLE PRECISION NOT NULL,
    "codeSimScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "compositeScore" DOUBLE PRECISION NOT NULL,
    "signalPattern" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "evidenceLinkId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "EvidenceReviewDecision" NOT NULL,
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceReview_pkey" PRIMARY KEY ("id")
);

-- Indexes / uniques
CREATE UNIQUE INDEX "Embedding_organizationId_refType_refId_modelName_key" ON "Embedding"("organizationId", "refType", "refId", "modelName");
CREATE INDEX "Embedding_organizationId_refType_idx" ON "Embedding"("organizationId", "refType");
CREATE INDEX "Embedding_vector_hnsw_idx" ON "Embedding" USING hnsw ("vector" vector_cosine_ops);

CREATE UNIQUE INDEX "TicketSnapshot_organizationId_jiraKey_sprintId_key" ON "TicketSnapshot"("organizationId", "jiraKey", "sprintId");
CREATE INDEX "TicketSnapshot_organizationId_sprintId_idx" ON "TicketSnapshot"("organizationId", "sprintId");
CREATE INDEX "TicketSnapshot_organizationId_jiraKey_idx" ON "TicketSnapshot"("organizationId", "jiraKey");

CREATE UNIQUE INDEX "CommitSnapshot_organizationId_repoFullName_sha_key" ON "CommitSnapshot"("organizationId", "repoFullName", "sha");
CREATE INDEX "CommitSnapshot_organizationId_repoFullName_idx" ON "CommitSnapshot"("organizationId", "repoFullName");
CREATE INDEX "CommitSnapshot_organizationId_commitDate_idx" ON "CommitSnapshot"("organizationId", "commitDate");

CREATE UNIQUE INDEX "EvidenceLink_ticketSnapshotId_commitSnapshotId_key" ON "EvidenceLink"("ticketSnapshotId", "commitSnapshotId");
CREATE INDEX "EvidenceLink_organizationId_sprintId_idx" ON "EvidenceLink"("organizationId", "sprintId");
CREATE INDEX "EvidenceLink_ticketSnapshotId_idx" ON "EvidenceLink"("ticketSnapshotId");

CREATE UNIQUE INDEX "EvidenceReview_evidenceLinkId_key" ON "EvidenceReview"("evidenceLinkId");
CREATE INDEX "EvidenceReview_organizationId_idx" ON "EvidenceReview"("organizationId");

-- FKs
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketSnapshot" ADD CONSTRAINT "TicketSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommitSnapshot" ADD CONSTRAINT "CommitSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_ticketSnapshotId_fkey" FOREIGN KEY ("ticketSnapshotId") REFERENCES "TicketSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_commitSnapshotId_fkey" FOREIGN KEY ("commitSnapshotId") REFERENCES "CommitSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceReview" ADD CONSTRAINT "EvidenceReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceReview" ADD CONSTRAINT "EvidenceReview_evidenceLinkId_fkey" FOREIGN KEY ("evidenceLinkId") REFERENCES "EvidenceLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
