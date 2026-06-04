-- CreateTable
CREATE TABLE "DeliveryAnalysisSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT,
    "healthScore" INTEGER NOT NULL,
    "openWork" INTEGER NOT NULL,
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "overdue" INTEGER NOT NULL DEFAULT 0,
    "bugsOpen" INTEGER NOT NULL DEFAULT 0,
    "projectKeysJson" TEXT NOT NULL DEFAULT '[]',
    "snapshotJson" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAnalysisSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryAnalysisSnapshot_organizationId_syncedAt_idx" ON "DeliveryAnalysisSnapshot"("organizationId", "syncedAt");

-- AddForeignKey
ALTER TABLE "DeliveryAnalysisSnapshot" ADD CONSTRAINT "DeliveryAnalysisSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
