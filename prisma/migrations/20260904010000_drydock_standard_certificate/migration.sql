-- AlterEnum
ALTER TYPE "TrustDeficitReason" ADD VALUE IF NOT EXISTS 'SEMANTIC_DUPLICATE';

-- CreateEnum
CREATE TYPE "StandardPatternStatus" AS ENUM ('CANDIDATE', 'RATIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CertificateDecision" AS ENUM ('SHIP', 'HOLD', 'ACCEPT_RISK');

-- CreateTable
CREATE TABLE "StandardPattern" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patternKey" TEXT NOT NULL,
    "shapeLabel" TEXT NOT NULL,
    "plainSentence" TEXT NOT NULL,
    "exampleNamesJson" JSONB NOT NULL DEFAULT '[]',
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "status" "StandardPatternStatus" NOT NULL DEFAULT 'CANDIDATE',
    "ratifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandardPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseCertificate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "verifiedCount" INTEGER NOT NULL,
    "unverifiedCount" INTEGER NOT NULL,
    "unreliableCount" INTEGER NOT NULL,
    "acceptedRisk" TEXT NOT NULL,
    "decision" "CertificateDecision" NOT NULL,
    "rationale" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseCertificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StandardPattern_organizationId_patternKey_key" ON "StandardPattern"("organizationId", "patternKey");
CREATE INDEX "StandardPattern_organizationId_status_idx" ON "StandardPattern"("organizationId", "status");
CREATE UNIQUE INDEX "ReleaseCertificate_releaseId_key" ON "ReleaseCertificate"("releaseId");
CREATE INDEX "ReleaseCertificate_organizationId_signedAt_idx" ON "ReleaseCertificate"("organizationId", "signedAt");

ALTER TABLE "StandardPattern" ADD CONSTRAINT "StandardPattern_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReleaseCertificate" ADD CONSTRAINT "ReleaseCertificate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReleaseCertificate" ADD CONSTRAINT "ReleaseCertificate_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
