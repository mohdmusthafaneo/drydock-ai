-- CreateTable
CREATE TABLE "ExecutiveBriefingSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "headlineJson" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'llm_enriched',
    "factsHash" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveBriefingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveBriefingSnapshot_organizationId_key" ON "ExecutiveBriefingSnapshot"("organizationId");

-- CreateIndex
CREATE INDEX "ExecutiveBriefingSnapshot_organizationId_generatedAt_idx" ON "ExecutiveBriefingSnapshot"("organizationId", "generatedAt");

-- AddForeignKey
ALTER TABLE "ExecutiveBriefingSnapshot" ADD CONSTRAINT "ExecutiveBriefingSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
