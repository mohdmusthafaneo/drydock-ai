-- Phase 5.3: governed agent hire + generalized approvals

CREATE TYPE "ApprovalType" AS ENUM ('RECOMMENDATION', 'AGENT_HIRE', 'AGENT_ACTION', 'ORCHESTRATION_PLAN');

ALTER TABLE "DeliveryWorkflow" ADD COLUMN "agentTeamInitializedAt" TIMESTAMP(3);

ALTER TABLE "AgentRegistry" ADD COLUMN "role" TEXT;

DROP INDEX IF EXISTS "AgentRegistry_organizationId_agentType_key";

CREATE INDEX "AgentRegistry_organizationId_role_idx" ON "AgentRegistry"("organizationId", "role");

ALTER TABLE "Approval" ADD COLUMN "type" "ApprovalType" NOT NULL DEFAULT 'RECOMMENDATION';
ALTER TABLE "Approval" ADD COLUMN "title" TEXT;
ALTER TABLE "Approval" ADD COLUMN "payloadJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Approval" ADD COLUMN "requestedByAgentId" TEXT;

ALTER TABLE "Approval" ALTER COLUMN "recommendationId" DROP NOT NULL;

CREATE INDEX "Approval_organizationId_type_idx" ON "Approval"("organizationId", "type");
