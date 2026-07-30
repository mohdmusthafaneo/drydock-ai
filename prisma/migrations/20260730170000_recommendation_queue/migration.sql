-- CreateEnum
CREATE TYPE "RecommendationQueue" AS ENUM ('SETUP', 'OPS', 'RELEASE_GATE', 'GOVERNANCE');

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN "queue" "RecommendationQueue" NOT NULL DEFAULT 'OPS';

-- Backfill SETUP from known discovery / setup titles (incl. Grafana, previously missing from STALE_SETUP_TITLES)
UPDATE "Recommendation"
SET "queue" = 'SETUP'
WHERE "title" IN (
  'Enable human-governed recommendation loop',
  'Connect Jira for workflow intelligence',
  'Connect GitHub for change-risk signals',
  'Add Grafana observability connector',
  'Connect Prometheus for metric KPIs'
);

-- Backfill OPS from agent-analysis title prefixes
UPDATE "Recommendation"
SET "queue" = 'OPS'
WHERE "title" LIKE '[qa-blocked:%'
   OR "title" LIKE '[qa-board:%'
   OR "title" LIKE '[cloud:%';

-- Backfill RELEASE_GATE where linked to a release
UPDATE "Recommendation"
SET "queue" = 'RELEASE_GATE'
WHERE "releaseId" IS NOT NULL;

-- Remaining non-setup, non-ops rows without a release are GOVERNANCE
UPDATE "Recommendation"
SET "queue" = 'GOVERNANCE'
WHERE "queue" = 'OPS'
  AND "releaseId" IS NULL
  AND "title" NOT LIKE '[qa-blocked:%'
  AND "title" NOT LIKE '[qa-board:%'
  AND "title" NOT LIKE '[cloud:%'
  AND "title" NOT IN (
    'Enable human-governed recommendation loop',
    'Connect Jira for workflow intelligence',
    'Connect GitHub for change-risk signals',
    'Add Grafana observability connector',
    'Connect Prometheus for metric KPIs'
  );

-- CreateIndex
CREATE INDEX "Recommendation_organizationId_queue_status_idx" ON "Recommendation"("organizationId", "queue", "status");
