-- AlterTable
ALTER TABLE "Release" ADD COLUMN "metadataJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Release" ADD COLUMN "jiraSprintId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Release_organizationId_jiraSprintId_key" ON "Release"("organizationId", "jiraSprintId");
