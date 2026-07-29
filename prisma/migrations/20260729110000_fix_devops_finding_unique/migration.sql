-- DropOldUnique
DROP INDEX IF EXISTS "DevOpsHygieneFinding_runId_checkId_severity_resourceType_resourceRef_key";

-- CreateIndex
CREATE UNIQUE INDEX "DevOpsHygieneFinding_runId_rank_key" ON "DevOpsHygieneFinding"("runId", "rank");

-- CreateIndex
CREATE INDEX "DevOpsHygieneFinding_runId_checkId_idx" ON "DevOpsHygieneFinding"("runId", "checkId");
