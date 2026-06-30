-- CreateTable
CREATE TABLE "JiraCalibrationProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "windowDays" INTEGER NOT NULL DEFAULT 90,
    "observedJson" TEXT NOT NULL DEFAULT '{}',
    "profileJson" TEXT NOT NULL DEFAULT '{}',
    "llmRationale" TEXT,
    "confidence" TEXT,
    "source" TEXT NOT NULL DEFAULT 'deterministic',
    "calibratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraCalibrationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JiraCalibrationProfile_organizationId_idx" ON "JiraCalibrationProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "JiraCalibrationProfile_organizationId_projectKey_key" ON "JiraCalibrationProfile"("organizationId", "projectKey");

-- AddForeignKey
ALTER TABLE "JiraCalibrationProfile" ADD CONSTRAINT "JiraCalibrationProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
