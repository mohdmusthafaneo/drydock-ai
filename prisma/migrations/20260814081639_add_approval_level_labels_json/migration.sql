-- AlterTable
ALTER TABLE "GovernancePolicy" ADD COLUMN     "approvalLevelLabelsJson" JSONB NOT NULL DEFAULT '{}';
