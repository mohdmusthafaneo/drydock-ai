-- Schema fields added without a migration (tkt-077 recipientId, agent chat feedback).
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "recipientId" TEXT;
ALTER TABLE "AgentChatMessage" ADD COLUMN IF NOT EXISTS "feedback" TEXT;
