-- CreateEnum
CREATE TYPE "AgentWakeupSource" AS ENUM ('timer', 'event', 'approval', 'on_demand', 'delegation');

-- CreateEnum
CREATE TYPE "AgentWakeupStatus" AS ENUM ('queued', 'running', 'completed', 'skipped', 'coalesced');

-- CreateEnum
CREATE TYPE "AgentHeartbeatRunStatus" AS ENUM ('running', 'succeeded', 'failed', 'timed_out', 'cancelled');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentStatus" ADD VALUE 'RUNNING';
ALTER TYPE "AgentStatus" ADD VALUE 'PAUSED';
ALTER TYPE "AgentStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "AgentStatus" ADD VALUE 'ERROR';
ALTER TYPE "AgentStatus" ADD VALUE 'TERMINATED';

-- AlterTable
ALTER TABLE "AgentRegistry" ADD COLUMN     "adapterConfigJson" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "adapterType" TEXT NOT NULL DEFAULT 'internal',
ADD COLUMN     "createdByAgentId" TEXT,
ADD COLUMN     "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "permissionsJson" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "reportsToAgentId" TEXT,
ADD COLUMN     "runtimeConfigJson" TEXT NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "AgentApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'default',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWakeupRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "source" "AgentWakeupSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AgentWakeupStatus" NOT NULL DEFAULT 'queued',
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT,
    "coalescedCount" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "AgentWakeupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentHeartbeatRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "wakeupRequestId" TEXT NOT NULL,
    "status" "AgentHeartbeatRunStatus" NOT NULL DEFAULT 'running',
    "source" "AgentWakeupSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "contextSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "exitCode" INTEGER,
    "error" TEXT,
    "summary" TEXT,
    "tokenUsageJson" TEXT NOT NULL DEFAULT '{}',
    "logsJson" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "AgentHeartbeatRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentApiKey_agentId_idx" ON "AgentApiKey"("agentId");

-- CreateIndex
CREATE INDEX "AgentApiKey_keyHash_idx" ON "AgentApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "AgentWakeupRequest_organizationId_status_requestedAt_idx" ON "AgentWakeupRequest"("organizationId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "AgentWakeupRequest_agentId_status_idx" ON "AgentWakeupRequest"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWakeupRequest_organizationId_idempotencyKey_key" ON "AgentWakeupRequest"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentHeartbeatRun_organizationId_startedAt_idx" ON "AgentHeartbeatRun"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentHeartbeatRun_agentId_startedAt_idx" ON "AgentHeartbeatRun"("agentId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRegistry_organizationId_status_idx" ON "AgentRegistry"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "AgentRegistry" ADD CONSTRAINT "AgentRegistry_reportsToAgentId_fkey" FOREIGN KEY ("reportsToAgentId") REFERENCES "AgentRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApiKey" ADD CONSTRAINT "AgentApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApiKey" ADD CONSTRAINT "AgentApiKey_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWakeupRequest" ADD CONSTRAINT "AgentWakeupRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWakeupRequest" ADD CONSTRAINT "AgentWakeupRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHeartbeatRun" ADD CONSTRAINT "AgentHeartbeatRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHeartbeatRun" ADD CONSTRAINT "AgentHeartbeatRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHeartbeatRun" ADD CONSTRAINT "AgentHeartbeatRun_wakeupRequestId_fkey" FOREIGN KEY ("wakeupRequestId") REFERENCES "AgentWakeupRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
