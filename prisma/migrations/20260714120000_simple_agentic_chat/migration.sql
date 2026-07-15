-- Simple agentic chat: drop multi-agent orchestration, simplify AgentChat*

-- ---------------------------------------------------------------------------
-- Drop Timescale policies/hypertables before table drops
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM remove_retention_policy('"AgentHeartbeatRun"', if_exists => true);
  PERFORM remove_compression_policy('"AgentHeartbeatRun"', if_exists => true);
EXCEPTION WHEN undefined_function OR undefined_table OR OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM remove_retention_policy('"AgentChatStreamChunk"', if_exists => true);
  PERFORM remove_compression_policy('"AgentChatStreamChunk"', if_exists => true);
EXCEPTION WHEN undefined_function OR undefined_table OR OTHERS THEN
  NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Drop orchestration + chat-stream tables
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "AgentChatStreamChunk" CASCADE;
DROP TABLE IF EXISTS "AgentHeartbeatRun" CASCADE;
DROP TABLE IF EXISTS "AgentWakeupRequest" CASCADE;
DROP TABLE IF EXISTS "AgentChatParticipant" CASCADE;
DROP TABLE IF EXISTS "AgentApiKey" CASCADE;
DROP TABLE IF EXISTS "AgentRegistry" CASCADE;

-- ---------------------------------------------------------------------------
-- DeliveryWorkflow / Approval cleanup
-- ---------------------------------------------------------------------------
ALTER TABLE "DeliveryWorkflow" DROP COLUMN IF EXISTS "agentTeamInitializedAt";
ALTER TABLE "Approval" DROP COLUMN IF EXISTS "requestedByAgentId";

-- Migrate legacy approval types away from removed enum values
DO $$
BEGIN
  UPDATE "Approval" SET "type" = 'RECOMMENDATION'
  WHERE "type"::text IN ('AGENT_HIRE', 'ORCHESTRATION_PLAN');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Recreate ApprovalType enum with reduced values (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'ApprovalType' AND e.enumlabel = 'AGENT_HIRE'
  ) THEN
    CREATE TYPE "ApprovalType_new" AS ENUM ('RECOMMENDATION', 'AGENT_ACTION');
    ALTER TABLE "Approval" ALTER COLUMN "type" DROP DEFAULT;
    ALTER TABLE "Approval"
      ALTER COLUMN "type" TYPE "ApprovalType_new"
      USING ("type"::text::"ApprovalType_new");
    DROP TYPE "ApprovalType";
    ALTER TYPE "ApprovalType_new" RENAME TO "ApprovalType";
    ALTER TABLE "Approval" ALTER COLUMN "type" SET DEFAULT 'RECOMMENDATION'::"ApprovalType";
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- AgentChatMessage: drop agent columns, rename agent_reply → assistant
-- ---------------------------------------------------------------------------
ALTER TABLE "AgentChatMessage" DROP COLUMN IF EXISTS "authorAgentId";
ALTER TABLE "AgentChatMessage" DROP COLUMN IF EXISTS "targetAgentId";
ALTER TABLE "AgentChatMessage" DROP COLUMN IF EXISTS "runId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'AgentChatMessageKind' AND e.enumlabel = 'agent_reply'
  ) THEN
    CREATE TYPE "AgentChatMessageKind_new" AS ENUM (
      'human',
      'assistant',
      'system',
      'approval_request',
      'approval_resolved'
    );

    ALTER TABLE "AgentChatMessage" ALTER COLUMN "kind" DROP DEFAULT;
    ALTER TABLE "AgentChatMessage"
      ALTER COLUMN "kind" TYPE text
      USING (
        CASE
          WHEN "kind"::text = 'agent_reply' THEN 'assistant'
          ELSE "kind"::text
        END
      );
    ALTER TABLE "AgentChatMessage"
      ALTER COLUMN "kind" TYPE "AgentChatMessageKind_new"
      USING ("kind"::"AgentChatMessageKind_new");

    DROP TYPE "AgentChatMessageKind";
    ALTER TYPE "AgentChatMessageKind_new" RENAME TO "AgentChatMessageKind";
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- AgentChatThread: simplify status + drop external source fields
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'AgentChatThreadStatus' AND e.enumlabel = 'routing'
  ) THEN
    UPDATE "AgentChatThread"
    SET "status" = 'open'
    WHERE "status"::text IN ('routing', 'active', 'awaiting_human', 'stalled');

    CREATE TYPE "AgentChatThreadStatus_new" AS ENUM ('open', 'done');
    ALTER TABLE "AgentChatThread" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "AgentChatThread"
      ALTER COLUMN "status" TYPE "AgentChatThreadStatus_new"
      USING ("status"::text::"AgentChatThreadStatus_new");
    ALTER TABLE "AgentChatThread"
      ALTER COLUMN "status" SET DEFAULT 'open'::"AgentChatThreadStatus_new";
    DROP TYPE "AgentChatThreadStatus";
    ALTER TYPE "AgentChatThreadStatus_new" RENAME TO "AgentChatThreadStatus";
  END IF;
END $$;

DROP INDEX IF EXISTS "AgentChatThread_organizationId_externalSource_externalThreadId_key";
ALTER TABLE "AgentChatThread" DROP COLUMN IF EXISTS "externalSource";
ALTER TABLE "AgentChatThread" DROP COLUMN IF EXISTS "externalChannelId";
ALTER TABLE "AgentChatThread" DROP COLUMN IF EXISTS "externalThreadId";

-- ---------------------------------------------------------------------------
-- Drop unused enums
-- ---------------------------------------------------------------------------
DROP TYPE IF EXISTS "AgentType";
DROP TYPE IF EXISTS "AgentStatus";
DROP TYPE IF EXISTS "AgentWakeupSource";
DROP TYPE IF EXISTS "AgentWakeupStatus";
DROP TYPE IF EXISTS "AgentHeartbeatRunStatus";
DROP TYPE IF EXISTS "AgentChatParticipantRole";
DROP TYPE IF EXISTS "AgentChatStreamChunkKind";
DROP TYPE IF EXISTS "AgentChatExternalSource";
