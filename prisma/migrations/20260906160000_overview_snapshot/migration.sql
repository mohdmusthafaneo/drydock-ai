-- CreateTable
CREATE TABLE "OverviewSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectKey" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" JSONB NOT NULL,

    CONSTRAINT "OverviewSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OverviewSnapshot_organizationId_capturedAt_idx" ON "OverviewSnapshot"("organizationId", "capturedAt");

-- CreateIndex
CREATE INDEX "OverviewSnapshot_organizationId_projectKey_capturedAt_idx" ON "OverviewSnapshot"("organizationId", "projectKey", "capturedAt");

-- AddForeignKey
ALTER TABLE "OverviewSnapshot" ADD CONSTRAINT "OverviewSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
