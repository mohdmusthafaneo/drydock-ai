-- CreateEnum
CREATE TYPE "AgentChatThreadStatus" AS ENUM ('open', 'routing', 'active', 'awaiting_human', 'done', 'stalled');

-- CreateEnum
CREATE TYPE "AgentChatMessageKind" AS ENUM ('human', 'agent_reply', 'system', 'approval_request', 'approval_resolved');

-- CreateEnum
CREATE TYPE "AgentChatParticipantRole" AS ENUM ('coordinator', 'specialist', 'human');

-- CreateEnum
CREATE TYPE "AgentChatStreamChunkKind" AS ENUM ('text_delta', 'thinking_delta', 'tool_start', 'tool_end', 'run_complete', 'run_error');

-- CreateEnum
CREATE TYPE "AgentChatExternalSource" AS ENUM ('web', 'slack', 'discord', 'api');

-- AlterEnum
ALTER TYPE "AgentWakeupSource" ADD VALUE 'chat';

-- CreateTable
CREATE TABLE "AgentChatThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "AgentChatThreadStatus" NOT NULL DEFAULT 'open',
    "contextSummary" TEXT,
    "createdByUserId" TEXT,
    "externalSource" "AgentChatExternalSource" NOT NULL DEFAULT 'web',
    "externalChannelId" TEXT,
    "externalThreadId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentChatParticipant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "AgentChatParticipantRole" NOT NULL,
    "agentId" TEXT,
    "userId" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedByAgentId" TEXT,

    CONSTRAINT "AgentChatParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentChatMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "kind" "AgentChatMessageKind" NOT NULL,
    "contentMarkdown" TEXT NOT NULL DEFAULT '',
    "reasoningJson" TEXT NOT NULL DEFAULT '{}',
    "authorUserId" TEXT,
    "authorAgentId" TEXT,
    "targetAgentId" TEXT,
    "approvalId" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentChatStreamChunk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "messageId" TEXT,
    "sequence" INTEGER NOT NULL,
    "kind" "AgentChatStreamChunkKind" NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentChatStreamChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentChatThread_organizationId_status_updatedAt_idx" ON "AgentChatThread"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentChatThread_organizationId_externalSource_externalThrea_key" ON "AgentChatThread"("organizationId", "externalSource", "externalThreadId");

-- CreateIndex
CREATE INDEX "AgentChatParticipant_organizationId_threadId_idx" ON "AgentChatParticipant"("organizationId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentChatParticipant_threadId_agentId_key" ON "AgentChatParticipant"("threadId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentChatParticipant_threadId_userId_key" ON "AgentChatParticipant"("threadId", "userId");

-- CreateIndex
CREATE INDEX "AgentChatMessage_threadId_createdAt_idx" ON "AgentChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentChatMessage_organizationId_threadId_idx" ON "AgentChatMessage"("organizationId", "threadId");

-- CreateIndex
CREATE INDEX "AgentChatStreamChunk_threadId_runId_sequence_idx" ON "AgentChatStreamChunk"("threadId", "runId", "sequence");

-- CreateIndex
CREATE INDEX "AgentChatStreamChunk_threadId_createdAt_idx" ON "AgentChatStreamChunk"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentChatThread" ADD CONSTRAINT "AgentChatThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChatThread" ADD CONSTRAINT "AgentChatThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChatParticipant" ADD CONSTRAINT "AgentChatParticipant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChatParticipant" ADD CONSTRAINT "AgentChatParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AgentChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChatParticipant" ADD CONSTRAINT "AgentChatParticipant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChatParticipant" ADD CONSTRAINT "AgentChatParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChatMessage" ADD CONSTRAINT "AgentChatMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChatMessage" ADD CONSTRAINT "AgentChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AgentChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChatMessage" ADD CONSTRAINT "AgentChatMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChatMessage" ADD CONSTRAINT "AgentChatMessage_authorAgentId_fkey" FOREIGN KEY ("authorAgentId") REFERENCES "AgentRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChatMessage" ADD CONSTRAINT "AgentChatMessage_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChatStreamChunk" ADD CONSTRAINT "AgentChatStreamChunk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
