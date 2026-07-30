-- Close legacy pending Approvals that were seeded for SETUP recommendations.
-- SETUP never belongs in the leadership Approval Center.
UPDATE "Approval" AS a
SET
  "decision" = 'REJECTED',
  "comment" = 'Lane migration — SETUP tasks are not leadership approvals',
  "decidedAt" = NOW(),
  "payloadJson" = jsonb_build_object('systemDismissal', true, 'reason', 'queue_lane_migration')
FROM "Recommendation" AS r
WHERE a."recommendationId" = r.id
  AND r."queue" = 'SETUP'
  AND a."decision" IS NULL;
