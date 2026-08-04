-- AlterTable
ALTER TABLE "AgentChatThread" ADD COLUMN "externalSource" TEXT;
ALTER TABLE "AgentChatThread" ADD COLUMN "externalThreadId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AgentChatThread_organizationId_externalSource_externalThreadId_key"
  ON "AgentChatThread"("organizationId", "externalSource", "externalThreadId");
