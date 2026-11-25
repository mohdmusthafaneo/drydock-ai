-- CreateTable
CREATE TABLE "AgentInstruction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentInstruction_organizationId_agentKey_idx" ON "AgentInstruction"("organizationId", "agentKey");

-- CreateIndex
CREATE INDEX "AgentInstruction_organizationId_agentKey_sortOrder_idx" ON "AgentInstruction"("organizationId", "agentKey", "sortOrder");

-- AddForeignKey
ALTER TABLE "AgentInstruction" ADD CONSTRAINT "AgentInstruction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
