-- Add actorType column if missing (supports both fresh DBs and restored dumps)
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "actorType" TEXT;

-- Backfill actorType for existing audit log rows
-- human: userId is present (user-initiated action)
-- integration: action starts with integration., sync., prometheus., github., jira., aws., grafana., delivery_dna., connect.
-- system: everything else (background jobs, agent actions, etc.)
UPDATE "AuditLog"
SET "actorType" = CASE
  WHEN "userId" IS NOT NULL THEN 'human'
  WHEN action LIKE 'integration.%'
    OR action LIKE 'sync.%'
    OR action LIKE 'prometheus.%'
    OR action LIKE 'github.%'
    OR action LIKE 'jira.%'
    OR action LIKE 'aws.%'
    OR action LIKE 'grafana.%'
    OR action LIKE 'delivery_dna.%'
    OR action LIKE 'connect.%'
    OR action LIKE 'slack.%'
    OR action LIKE 'jira_oauth%'
    OR action LIKE 'slack_oauth%'
    OR action LIKE 'grafana_%'
    OR action LIKE 'prometheus_%'
  THEN 'integration'
  ELSE 'system'
END
WHERE "actorType" IS NULL;
