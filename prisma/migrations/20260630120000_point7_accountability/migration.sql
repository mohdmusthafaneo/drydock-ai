-- AlterTable
ALTER TABLE "CodeAnalysisPullRequest" ADD COLUMN "reviewersJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "CodeAnalysisPullRequest" ADD COLUMN "filesJson" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "DeploymentEvent" ADD COLUMN "mergeCommitSha" TEXT;
ALTER TABLE "DeploymentEvent" ADD COLUMN "pullRequestNumber" INTEGER;

-- CreateTable
CREATE TABLE "IncidentCodeLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "pullRequestExternalId" TEXT,
    "commitSha" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "reason" TEXT NOT NULL,
    "peopleJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentCodeLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentCodeLink_organizationId_incidentId_idx" ON "IncidentCodeLink"("organizationId", "incidentId");

-- AddForeignKey
ALTER TABLE "IncidentCodeLink" ADD CONSTRAINT "IncidentCodeLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentCodeLink" ADD CONSTRAINT "IncidentCodeLink_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
